import { describe, expect, it } from 'vitest';
import type { AlsoRepo, TurnOutcome } from '../../orchestration/application/chat-session.js';
import type { UserPort } from '../../orchestration/application/ports.js';
import { Workspace, type WorkspaceRepo } from '../domain/workspace.js';
import { WorkspaceSession, type RepoSession } from './workspace-session.js';

class FakeChat {
  readonly inputs: { input: string; also: readonly AlsoRepo[]; force: 'design' | undefined }[] = [];
  constructor(private readonly name: string) {}
  async handle(input: string, also: readonly AlsoRepo[] = [], force?: 'design'): Promise<TurnOutcome> {
    this.inputs.push({ input, also, force });
    return { kind: 'answer', answer: `${this.name} 답`, checked: [], costUsd: 0, durationMs: 1, basis: null };
  }
}

function user(pick: string | null, interactive = true): UserPort & { asked: string[][] } {
  const asked: string[][] = [];
  return {
    interactive,
    asked,
    choose: async () => 0,
    confirmFact: async () => ({ kind: 'unsure' }),
    pickPast: async () => null,
    pickRepo: async (candidates) => {
      asked.push(candidates.map((c) => c.name));
      return pick;
    },
  };
}

function setup(p: { roots?: string[]; current?: string | null; pick?: string | null; interactive?: boolean; profiles?: Record<string, string> } = {}) {
  const roots = p.roots ?? ['E:/w/shop-api', 'E:/w/shop-web'];
  const chats = new Map<string, FakeChat>();
  const opened: string[] = [];
  const currents: string[] = [];
  const u = user(p.pick ?? null, p.interactive ?? true);
  const session = new WorkspaceSession({
    workspace: Workspace.of(roots, p.current ?? null),
    user: u,
    open: (repo: WorkspaceRepo): RepoSession => {
      opened.push(repo.name);
      const chat = new FakeChat(repo.name);
      chats.set(repo.name, chat);
      return { repo, profileName: p.profiles?.[repo.name] ?? 'personal', chat, knowledge: null };
    },
    onCurrent: (repo) => void currents.push(repo.name),
  });
  return { session, chats, opened, currents, user: u };
}

describe('WorkspaceSession', () => {
  it('메시지에 나온 저장소의 세션으로 보낸다', async () => {
    const { session, chats } = setup();
    const turn = await session.handle('shop-web에서 Money 설명해줘');
    expect(turn).toMatchObject({ kind: 'answer', answer: 'shop-web 답', repo: 'shop-web' });
    expect(chats.get('shop-web')!.inputs[0]!.also).toEqual([]);
  });

  it('/design처럼 라우터를 건너뛰는 요청은 그 표시를 저장소 세션에 그대로 넘긴다', async () => {
    const { session, chats } = setup();
    await session.handle('shop-api 쿠폰 기능', 'design');
    expect(chats.get('shop-api')!.inputs[0]!.force).toBe('design');
    await session.handle('shop-api 설명');
    expect(chats.get('shop-api')!.inputs[1]!.force).toBeUndefined();
  });

  it('저장소 세션은 한 번만 연다', async () => {
    const { session, opened } = setup();
    await session.handle('shop-api 설명');
    await session.handle('shop-api 다시');
    expect(opened).toEqual(['shop-api']);
  });

  it('못 정하면 사용자에게 고르게 하고 고른 저장소로 보낸다', async () => {
    const { session, user: u } = setup({ pick: 'shop-api' });
    const turn = await session.handle('이거 설명해줘');
    expect(u.asked).toEqual([['shop-api', 'shop-web']]);
    expect(turn).toMatchObject({ repo: 'shop-api' });
    expect(session.current()?.name).toBe('shop-api');
  });

  it('화면이 없으면 묻지 않고 알린다', async () => {
    const { session, user: u } = setup({ interactive: false });
    const turn = await session.handle('이거 설명해줘');
    expect(u.asked).toEqual([]);
    expect(turn).toMatchObject({ kind: 'notice', repo: null });
    if (turn.kind === 'notice') expect(turn.message).toContain('/repo');
  });

  it('두 저장소 질문은 첫 저장소가 나머지를 함께 받아 답한다', async () => {
    const { session, chats } = setup();
    await session.handle('shop-web과 shop-api의 Money 차이');
    expect(chats.get('shop-web')!.inputs[0]!.also.map((a) => a.name)).toEqual(['shop-api']);
    expect(chats.has('shop-api')).toBe(true);
  });

  it('계정이 다른 저장소에 걸친 질문은 하지 않는다', async () => {
    const { session, chats } = setup({ profiles: { 'shop-api': 'work' } });
    const turn = await session.handle('shop-web과 shop-api 비교');
    expect(turn.kind).toBe('notice');
    if (turn.kind === 'notice') expect(turn.message).toContain('shop-api은 다른 계정(work)의 저장소라서');
    expect(chats.get('shop-web')?.inputs ?? []).toEqual([]);
  });

  it('지금 저장소가 바뀌면 알린다', async () => {
    const { session, currents } = setup({ current: 'E:/w/shop-api' });
    await session.handle('이거 설명');
    await session.handle('shop-web 설명');
    expect(currents).toEqual(['shop-web']);
    expect(session.select('shop-api')?.name).toBe('shop-api');
    expect(currents).toEqual(['shop-web', 'shop-api']);
  });
});
