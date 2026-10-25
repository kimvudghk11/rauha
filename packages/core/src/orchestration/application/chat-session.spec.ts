import { describe, expect, it } from 'vitest';
import type { MemoryPort } from '../../memory/application/memory.port.js';
import type { MemoryEntry, MemoryNode, Recall } from '../../memory/domain/work-memory.js';
import type { CheckedClaim } from '../domain/fact-check.js';
import { ChatSession, type RunContextBlocks } from './chat-session.js';
import { RoleSettingsDto, type MemberRole } from './dto/role-settings.dto.js';
import type { RunOutcome } from './minimal-loop.service.js';
import type { Assumption } from './dto/intake.dto.js';
import type { FactAnswer, MemberCall, MemberResult, PastCandidate, TeamMemberPort, UserPort } from './ports.js';

// ── 가짜들 ───────────────────────────────────────────────────

class FakeMemory implements MemoryPort {
  readonly nodes = new Map<string, MemoryNode>();
  readonly edges: MemoryEntry['edges'][number][] = [];
  async save(entry: MemoryEntry) {
    for (const n of entry.nodes) if (!this.nodes.has(n.id)) this.nodes.set(n.id, n);
    this.edges.push(...entry.edges);
  }
  async search(text: string, limit: number): Promise<Recall[]> {
    const words = text.split(/\s+/).filter((w) => w !== '');
    const heads = [...this.nodes.values()].filter((n) => (n.kind === 'work' || n.kind === 'question') && this.textOf(n.id).some((t) => words.some((w) => t.includes(w))));
    return heads
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit)
      .map((work) => ({ work, neighbors: this.edges.filter((e) => e.from === work.id && e.kind !== 'extends').map((e) => this.nodes.get(e.to)!).filter(Boolean) }));
  }
  async recent(limit: number) {
    return this.search('', limit);
  }
  private textOf(id: string): string[] {
    return [this.nodes.get(id)!.text, ...this.edges.filter((e) => e.from === id).map((e) => this.nodes.get(e.to)?.text ?? '')];
  }
}

type Script = (call: MemberCall) => unknown;

class FakeTeam implements TeamMemberPort {
  readonly calls: { role: MemberRole; message: string }[] = [];
  constructor(private readonly scripts: Partial<Record<MemberRole, Script[]>>) {}
  async run(call: MemberCall): Promise<MemberResult> {
    this.calls.push({ role: call.role, message: call.userMessage });
    const queue = this.scripts[call.role] ?? [];
    const script = queue.length > 1 ? (queue.shift() as Script) : queue[0];
    return {
      output: script ? script(call) : null,
      error: null,
      usage: { model: call.setting.tier, durationMs: 5, costUsd: 0.002, turns: 1, inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, denials: [], endReason: 'success' },
      fetched: [],
    };
  }
}

class FakeUser implements UserPort {
  readonly pastAsked: PastCandidate[][] = [];
  constructor(
    readonly interactive: boolean,
    private readonly pick: (candidates: readonly PastCandidate[]) => string | null = (c) => c[0]?.id ?? null,
  ) {}
  async choose(_a: Assumption) {
    return 0;
  }
  async confirmFact(_c: CheckedClaim): Promise<FactAnswer> {
    return { kind: 'unsure' };
  }
  async pickPast(candidates: readonly PastCandidate[]) {
    this.pastAsked.push([...candidates]);
    return this.pick(candidates);
  }
}

const blank = { path: null, line: null, quote: null, name: null, url: null, text: null };

function outcome(over: Partial<RunOutcome> = {}): RunOutcome {
  return {
    status: 'complete',
    stopReason: null,
    title: 'Money에 퍼센트 할인 discount 추가',
    calls: 4,
    implementerAttempts: 1,
    costUsd: 0.05,
    durationMs: 60_000,
    usage: { haiku: { calls: 2, tokens: 100 }, sonnet: { calls: 2, tokens: 50 }, opus: { calls: 0, tokens: 0 } },
    escalated: false,
    finalTier: 'haiku',
    facts: {
      checked: [{ kind: 'decision', text: 'Math.floor를 할인 후 금액에 씀 — 정한 해석', evidence: [], verified: [{ kind: 'user', text: 'x' }], isGuess: false }],
      reviewerGuesses: [],
      unconfirmed: [],
      reviewRounds: 1,
      reviewMissing: false,
    },
    changedInRun: [{ path: 'src/money.ts', kind: 'modified' }],
    snapshotAfter: new Map([['src/money.ts', 'modified:h1']]),
    lockedTests: ['src/money.spec.ts'],
    assumptions: [{ question: '버림 대상', chosen: '할인 후 금액에서 버림', confirmed: false }],
    explanation: null,
    logDir: '/runs/x',
    guide: { toMarkdown: () => '# 안내서', toTerminal: () => '# 안내서' } as unknown as RunOutcome['guide'],
    ...over,
  };
}

class FakeLoops {
  readonly runs: { request: string; context: RunContextBlocks; carried: ReadonlyMap<string, string> }[] = [];
  constructor(private readonly outcomes: RunOutcome[] = [outcome()]) {}
  newLoop = (carried: ReadonlyMap<string, string>) => ({
    run: async (request: string, context: RunContextBlocks) => {
      this.runs.push({ request, context, carried });
      return this.outcomes.length > 1 ? (this.outcomes.shift() as RunOutcome) : this.outcomes[0]!;
    },
  });
}

const route = (mode: 'work' | 'question', refersToPast = false, pastQuery: string | null = null) => () => ({ mode, refersToPast, pastQuery });

function session(p: { team: FakeTeam; loops?: FakeLoops; memory?: FakeMemory; user?: UserPort; files?: Record<string, string> }) {
  let clock = Date.parse('2026-10-25T07:00:00.000Z');
  let id = 0;
  return ChatSession.start({
    newLoop: (p.loops ?? new FakeLoops()).newLoop,
    team: p.team,
    workspace: { readFile: async (path: string) => p.files?.[path] ?? null },
    memory: p.memory ?? new FakeMemory(),
    user: p.user ?? new FakeUser(true),
    progress: { step: () => {} },
    roles: RoleSettingsDto.defaults(),
    now: () => (clock += 60_000),
    newId: () => `id${(id += 1)}`,
    today: () => '2026-10-25',
  });
}

// ── 테스트 ───────────────────────────────────────────────────

describe('ChatSession — 질문', () => {
  it('질문이면 테스트·구현 없이 답하고, 근거가 확인된 주장과 추측을 나눈다', async () => {
    const team = new FakeTeam({
      router: [route('question')],
      answerer: [
        () => ({
          answer: 'Money.discount는 할인 후 금액을 버립니다.',
          claims: [
            { text: 'floor를 쓴다', evidence: [{ ...blank, kind: 'code', path: 'src/money.ts', line: 3, quote: 'Math.floor(this.amount * rate)' }] },
            { text: '예전엔 round였다', evidence: [] },
          ],
        }),
      ],
    });
    const loops = new FakeLoops();
    const turn = await session({ team, loops, files: { 'src/money.ts': 'return Money.of(Math.floor(this.amount * rate))' } }).handle('discount는 왜 floor야?');
    expect(team.calls.map((c) => c.role)).toEqual(['router', 'answerer']);
    expect(loops.runs).toEqual([]);
    expect(turn.kind).toBe('answer');
    if (turn.kind !== 'answer') return;
    expect(turn.checked.map((c) => c.isGuess)).toEqual([false, true]);
  });

  it('왜 이렇게 짰냐는 질문에는 기억된 결정을 근거로 답한다', async () => {
    const memory = new FakeMemory();
    const team = new FakeTeam({
      router: [route('work'), route('question')],
      answerer: [
        (call) => {
          expect(call.userMessage).toContain('<memory>');
          expect(call.userMessage).toContain('Math.floor를 할인 후 금액에 씀');
          return { answer: '정한 해석 때문입니다.', claims: [{ text: '할인 후 금액에서 버리기로 정했다', evidence: [{ ...blank, kind: 'record', text: 'Math.floor를 할인 후 금액에 씀' }] }] };
        },
      ],
    });
    const chat = session({ team, memory });
    await chat.handle('Money에 할인 넣어줘');
    const turn = await chat.handle('discount 왜 이렇게 짰어?');
    expect(turn.kind === 'answer' && turn.checked[0]!.isGuess).toBe(false);
  });
});

describe('ChatSession — 작업과 기억', () => {
  it('작업이 끝나면 기억에 남고 다음 질문에서 찾힌다', async () => {
    const memory = new FakeMemory();
    const team = new FakeTeam({ router: [route('work')] });
    await session({ team, memory }).handle('Money에 할인 넣어줘');
    const [found] = await memory.search('discount', 3);
    expect(found?.work.text).toContain('Money에 퍼센트 할인 discount 추가');
    expect(found?.neighbors.map((n) => n.kind).sort()).toEqual(['assumption', 'decision', 'file', 'test']);
  });

  it('clear 뒤 흐릿한 지시는 후보를 묻고, 고른 작업을 past_work로 넘기고 보충 선을 만든다', async () => {
    const memory = new FakeMemory();
    const loops = new FakeLoops();
    const user = new FakeUser(true);
    const team = new FakeTeam({ router: [route('work'), route('work', true, 'discount 할인')] });
    const chat = session({ team, memory, loops, user });
    await chat.handle('Money에 할인 넣어줘');
    chat.clear();
    await chat.handle('아까 그 기능에 음수 할인율도 막아줘');
    expect(user.pastAsked[0]!.map((c) => c.title)).toEqual(['Money에 퍼센트 할인 discount 추가']);
    expect(loops.runs[1]!.context.pastWork).toContain('Money에 퍼센트 할인 discount 추가');
    expect(loops.runs[1]!.context.conversation).toBeNull();
    expect(memory.edges.some((e) => e.kind === 'extends' && e.to === 'work:id1:0')).toBe(true);
  });

  it('후보를 새 작업으로 고르면 보충 선을 만들지 않는다', async () => {
    const memory = new FakeMemory();
    const loops = new FakeLoops();
    const team = new FakeTeam({ router: [route('work'), route('work', true, 'discount')] });
    const chat = session({ team, memory, loops, user: new FakeUser(true, () => null) });
    await chat.handle('Money에 할인 넣어줘');
    await chat.handle('그거 고쳐줘');
    expect(loops.runs[1]!.context.pastWork).toBeNull();
    expect(memory.edges.some((e) => e.kind === 'extends')).toBe(false);
  });

  it('화면이 없으면 후보를 묻지 않고 새 작업으로 진행한다', async () => {
    const user = new FakeUser(false);
    const loops = new FakeLoops();
    const team = new FakeTeam({ router: [route('work'), route('work', true, 'discount')] });
    const chat = session({ team, loops, user });
    await chat.handle('Money에 할인 넣어줘');
    await chat.handle('아까 그거 고쳐줘');
    expect(user.pastAsked).toEqual([]);
    expect(loops.runs[1]!.context.pastWork).toBeNull();
  });

  it('라우터 출력이 깨지면 작업으로 진행한다', async () => {
    const loops = new FakeLoops();
    const team = new FakeTeam({ router: [() => ({ nonsense: true })] });
    const turn = await session({ team, loops }).handle('뭔가 해줘');
    expect(turn.kind).toBe('work');
    expect(loops.runs).toHaveLength(1);
  });
});

describe('ChatSession — 세션', () => {
  it('두 번째 요청은 첫 요청이 남긴 변경 위에서 시작하고, 앞 대화를 함께 넘긴다', async () => {
    const loops = new FakeLoops([outcome(), outcome({ changedInRun: [{ path: 'src/cart.ts', kind: 'modified' }], snapshotAfter: new Map([['src/money.ts', 'modified:h1'], ['src/cart.ts', 'modified:h2']]) })]);
    const team = new FakeTeam({ router: [route('work')] });
    const chat = session({ team, loops });
    await chat.handle('Money에 할인 넣어줘');
    await chat.handle('방금 거 에러 메시지만 바꿔줘');
    expect(loops.runs[0]!.carried.size).toBe(0);
    expect([...loops.runs[1]!.carried]).toEqual([['src/money.ts', 'modified:h1']]);
    expect(loops.runs[1]!.context.conversation).toContain('Money에 할인 넣어줘');
    expect(chat.status().carriedFiles).toBe(2);
  });

  it('clear는 세션 대화만 비우고 기억과 이어 일할 파일은 남긴다', async () => {
    const memory = new FakeMemory();
    const loops = new FakeLoops();
    const team = new FakeTeam({ router: [route('work')] });
    const chat = session({ team, loops, memory });
    await chat.handle('Money에 할인 넣어줘');
    chat.clear();
    await chat.handle('다른 거 해줘');
    expect(loops.runs[1]!.context.conversation).toBeNull();
    expect(loops.runs[1]!.carried.size).toBe(1);
    expect(memory.nodes.size).toBeGreaterThan(0);
    expect(chat.status().turns).toBe(1);
  });

  it('사용량은 팀원 호출과 작업 비용을 모두 더한다', async () => {
    const team = new FakeTeam({ router: [route('work')] });
    const chat = session({ team });
    await chat.handle('Money에 할인 넣어줘');
    expect(chat.usage().costUsd).toBeCloseTo(0.052);
  });
});
