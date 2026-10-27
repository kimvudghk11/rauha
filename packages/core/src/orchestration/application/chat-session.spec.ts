import { describe, expect, it, vi } from 'vitest';
import { RepoRef } from '../../knowledge/domain/repo-ref.js';
import type { MemoryPort } from '../../memory/application/memory.port.js';
import type { MemoryEntry, MemoryNode, Recall } from '../../memory/domain/work-memory.js';
import type { CheckedClaim } from '../domain/fact-check.js';
import { ChatSession, type RunContextBlocks } from './chat-session.js';
import { RoleSettingsDto, type MemberRole } from './dto/role-settings.dto.js';
import type { RunOutcome } from './minimal-loop.service.js';
import type { Assumption } from './dto/intake.dto.js';
import type { FactAnswer, FileChange, MemberCall, MemberResult, PastCandidate, TeamMemberPort, UserPort } from './ports.js';

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
  readonly calls: { role: MemberRole; message: string; signal: AbortSignal | undefined; dirs: readonly string[] | undefined }[] = [];
  readonly prepared: MemberRole[] = [];
  /** 라우터가 이 약속이 풀릴 때까지 답하지 않게 한다(동시에 도는지 보려고). */
  routerGate: Promise<void> = Promise.resolve();
  constructor(
    private readonly scripts: Partial<Record<MemberRole, Script[]>>,
    private readonly limitOn: MemberRole | null = null,
    private readonly blockReason: 'usage-limit' | 'login' = 'usage-limit',
  ) {}
  prepare(call: Omit<MemberCall, 'userMessage' | 'signal'>): void {
    this.prepared.push(call.role);
  }
  async run(call: MemberCall): Promise<MemberResult> {
    this.calls.push({ role: call.role, message: call.userMessage, signal: call.signal, dirs: call.additionalDirectories });
    if (call.role === 'router') await this.routerGate;
    if (call.role === this.limitOn) {
      const limited = "You've hit your session limit · resets 9:40pm";
      return { output: null, error: limited, blocked: { reason: this.blockReason, message: limited }, fetched: [], usage: { model: call.setting.tier, durationMs: 1, costUsd: 0, turns: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, denials: [], endReason: 'error' } };
    }
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
    basis: null,
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

type SessionParts = { team: FakeTeam; loops?: FakeLoops; memory?: FakeMemory; user?: UserPort; files?: Record<string, string>; steps?: string[]; changes?: FileChange[] };

function session(p: SessionParts) {
  return ChatSession.start(sessionDeps(p));
}

function sessionDeps(p: SessionParts) {
  let clock = Date.parse('2026-10-25T07:00:00.000Z');
  let id = 0;
  return {
    newLoop: (p.loops ?? new FakeLoops()).newLoop,
    team: p.team,
    workspace: { readFile: async (path: string) => p.files?.[path] ?? null, reviewChanges: async () => p.changes ?? [] },
    memory: p.memory ?? new FakeMemory(),
    user: p.user ?? new FakeUser(true),
    progress: { step: (message: string) => void p.steps?.push(message) },
    roles: RoleSettingsDto.defaults(),
    now: () => (clock += 60_000),
    newId: () => `id${(id += 1)}`,
    today: () => '2026-10-25',
    nowText: () => '2026년 10월 25일 일요일 오후 11:40 (Asia/Seoul)',
  };
}

// ── 테스트 ───────────────────────────────────────────────────

describe('ChatSession — 질문', () => {
  it('답변 팀원에게 지금 날짜와 시각을 알려 준다 (시계를 못 읽는다며 답을 피하지 않게)', async () => {
    const team = new FakeTeam({ router: [route('question')], answerer: [() => ({ answer: '오후 11:40입니다.', claims: [{ text: '지금은 오후 11:40', evidence: [] }] })] });
    await session({ team }).handle('지금은 몇시야?');
    const message = team.calls.find((c) => c.role === 'answerer')!.message;
    expect(message).toContain('<now>2026년 10월 25일 일요일 오후 11:40 (Asia/Seoul)</now>');
  });

  it('라우터·답변 팀원은 누구인지·어떤 모델인지 없이 그냥 작업 중이라고 알린다', async () => {
    const team = new FakeTeam({ router: [route('question')], answerer: [() => ({ answer: '네.', claims: [{ text: 'a', evidence: [] }] })] });
    const steps: string[] = [];
    await session({ team, steps }).handle('이거 뭐야?');
    expect(steps).toEqual(['작업 중…', '작업 중…']);
  });

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
      answerer: [() => ({ answer: '정한 해석 때문입니다.', claims: [{ text: '할인 후 금액에서 버리기로 정했다', evidence: [{ ...blank, kind: 'record', text: 'Math.floor를 할인 후 금액에 씀' }] }] })],
    });
    const chat = session({ team, memory });
    await chat.handle('Money에 할인 넣어줘');
    const turn = await chat.handle('discount 왜 이렇게 짰어?');
    const message = team.calls.filter((c) => c.role === 'answerer').at(-1)!.message;
    expect(message).toContain('<memory>');
    expect(message).toContain('Math.floor를 할인 후 금액에 씀');
    expect(turn.kind === 'answer' && turn.checked[0]!.isGuess).toBe(false);
  });

  it('근거가 필요 없는 짧은 질문은 근거 없이 답해도 된다', async () => {
    const team = new FakeTeam({ router: [route('question')], answerer: [() => ({ answer: '안녕하세요.', claims: [] })] });
    const turn = await session({ team }).handle('안녕');
    expect(turn).toMatchObject({ kind: 'answer', answer: '안녕하세요.', checked: [] });
  });
});

describe('ChatSession — 저장소 지식', () => {
  const knowledge = {
    current: async () => ({ block: '<repo_knowledge repo="shop" basis="main (a1b2c3d)">\n요약\n</repo_knowledge>', basis: RepoRef.of({ branch: 'main', commit: 'a1b2c3d'.padEnd(40, '0'), dirty: false }) }),
    noteChanged: async () => undefined,
  };

  it('답변 팀원은 지식 묶음을 받고 답에 읽은 기준이 붙는다', async () => {
    const team = new FakeTeam({ router: [route('question')], answerer: [() => ({ answer: '네.', claims: [] })] });
    const turn = await ChatSession.start({ ...sessionDeps({ team }), knowledge }).handle('Money는 뭐야?');
    const message = team.calls.find((c) => c.role === 'answerer')!.message;
    expect(message.startsWith('<repo_knowledge')).toBe(true);
    expect(turn).toMatchObject({ kind: 'answer', basis: 'main (a1b2c3d)' });
  });

  it('라우터는 지식을 받지 않는다(빨라야 해서)', async () => {
    const team = new FakeTeam({ router: [route('question')], answerer: [() => ({ answer: '네.', claims: [] })] });
    await ChatSession.start({ ...sessionDeps({ team }), knowledge }).handle('Money는 뭐야?');
    expect(team.calls.find((c) => c.role === 'router')!.message).not.toContain('<repo_knowledge');
  });
});

describe('ChatSession — 여러 저장소', () => {
  const knowledgeAt = (repo: string, branch: string, c: string) => ({
    current: async () => ({ block: `<repo_knowledge repo="${repo}" basis="${branch} (${c})">\n요약\n</repo_knowledge>`, basis: RepoRef.of({ branch, commit: c.padEnd(40, '0'), dirty: false }) }),
    noteChanged: async () => undefined,
  });
  const also = [{ name: 'shop-web', root: 'E:/w/shop-web', knowledge: knowledgeAt('shop-web', 'dev', 'bbbbbbb') }];

  it('다른 저장소도 묻는 질문은 그 저장소 지식과 읽기 경로를 함께 받는다', async () => {
    const team = new FakeTeam({ router: [route('question')], answerer: [() => ({ answer: '차이는…', claims: [] })] });
    await ChatSession.start({ ...sessionDeps({ team }), knowledge: knowledgeAt('shop-api', 'main', 'a1b2c3d'), repoName: 'shop-api' }).handle('두 저장소 Money 차이', also);
    const call = team.calls.find((c) => c.role === 'answerer')!;
    expect(call.message).toContain('<repo_knowledge repo="shop-api"');
    expect(call.message).toContain('<repo_knowledge repo="shop-web"');
    expect(call.dirs).toEqual(['E:/w/shop-web']);
  });

  it('여러 저장소를 고치는 작업은 하지 않고 알린다', async () => {
    const loops = new FakeLoops();
    const team = new FakeTeam({ router: [route('work')] });
    const turn = await ChatSession.start({ ...sessionDeps({ team, loops }), repoName: 'shop-api' }).handle('둘 다 고쳐줘', also);
    expect(turn.kind).toBe('notice');
    expect(loops.runs).toEqual([]);
  });

  it('답에 저장소마다 읽은 기준이 붙는다', async () => {
    const team = new FakeTeam({ router: [route('question')], answerer: [() => ({ answer: '네.', claims: [] })] });
    const turn = await ChatSession.start({ ...sessionDeps({ team }), knowledge: knowledgeAt('shop-api', 'main', 'a1b2c3d'), repoName: 'shop-api' }).handle('비교해줘', also);
    expect(turn).toMatchObject({ kind: 'answer', basis: 'shop-api: main (a1b2c3d), shop-web: dev (bbbbbbb)' });
  });
});

describe('ChatSession — 내 변경 검토', () => {
  it('바뀐 파일이 없으면 리뷰어를 부르지 않는다', async () => {
    const team = new FakeTeam({});
    const turn = await session({ team }).review(null);
    expect(turn).toMatchObject({ kind: 'review', files: [], checked: [] });
    expect(team.calls).toEqual([]);
  });

  it('근거가 확인된 지적과 추측을 나누고 기억에는 남기지 않는다', async () => {
    const memory = new FakeMemory();
    const team = new FakeTeam({
      reviewer: [
        () => ({
          verdict: 'changes',
          summary: '덧셈이 뺄셈으로 되어 있습니다.',
          issues: [
            { problem: 'add가 빼기를 한다', path: 'src/money.ts', line: 1, evidence: [{ ...blank, kind: 'code', path: 'src/money.ts', line: 1, quote: 'return this.amount - other.amount' }] },
            { problem: '예전에도 그랬다', path: null, line: null, evidence: [] },
          ],
        }),
      ],
    });
    const turn = await session({ team, memory, changes: [{ path: 'src/money.ts', kind: 'modified' }], files: { 'src/money.ts': 'return this.amount - other.amount' } }).review(null);
    expect(turn.kind).toBe('review');
    if (turn.kind !== 'review') return;
    expect(turn.checked.map((c) => c.isGuess)).toEqual([false, true]);
    expect(turn.summary).toBe('덧셈이 뺄셈으로 되어 있습니다.');
    expect(memory.nodes.size).toBe(0);
  });

  it('리뷰어는 바뀐 파일 내용을 <files>로 받는다', async () => {
    const team = new FakeTeam({ reviewer: [() => ({ verdict: 'pass', summary: '좋습니다', issues: [] })] });
    await session({ team, changes: [{ path: 'src/money.ts', kind: 'modified' }], files: { 'src/money.ts': 'export class Money {}' } }).review('develop');
    const message = team.calls[0]!.message;
    expect(message).toContain('<file path="src/money.ts">\n1\texport class Money {}\n</file>');
    expect(message).toContain('develop');
  });
});

describe('ChatSession — 빠른 답', () => {
  it('세션을 시작하면 라우터와 답변 팀원을 미리 띄워 둔다', () => {
    const team = new FakeTeam({});
    session({ team });
    expect(team.prepared).toEqual(['router', 'answerer']);
  });

  it('라우터의 판정을 기다리지 않고 답변 팀원도 함께 시작한다', async () => {
    let openGate = () => {};
    const team = new FakeTeam({ router: [route('question')], answerer: [() => ({ answer: '네.', claims: [] })] });
    team.routerGate = new Promise((resolve) => (openGate = resolve));
    const pending = session({ team }).handle('이거 뭐야?');
    await vi.waitFor(() => expect(team.calls.map((c) => c.role)).toEqual(['router', 'answerer']));
    openGate();
    expect(await pending).toMatchObject({ kind: 'answer', answer: '네.' });
  });

  it('작업 요청이면 미리 시작한 답변을 멈추고 답을 기억에 남기지 않는다', async () => {
    const memory = new FakeMemory();
    const team = new FakeTeam({ router: [route('work')], answerer: [() => ({ answer: '버릴 답', claims: [] })] });
    const turn = await session({ team, memory }).handle('Money에 할인 넣어줘');
    expect(turn.kind).toBe('work');
    expect(team.calls.find((c) => c.role === 'answerer')!.signal!.aborted).toBe(true);
    expect([...memory.nodes.values()].some((n) => n.kind === 'question')).toBe(false);
  });

  it('흐릿하게 지난 작업을 가리킨 질문은 고른 작업으로 다시 답한다', async () => {
    const memory = new FakeMemory();
    const team = new FakeTeam({ router: [route('work'), route('question', true, 'discount')], answerer: [() => ({ answer: '정한 해석 때문입니다.', claims: [] })] });
    const chat = session({ team, memory });
    await chat.handle('Money에 할인 넣어줘');
    await chat.handle('아까 그거 왜 그렇게 했어?');
    const answers = team.calls.filter((c) => c.role === 'answerer');
    expect(answers.at(-2)!.signal!.aborted).toBe(true);
    expect(answers.at(-1)!.message).toContain('Money에 퍼센트 할인 discount 추가');
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

  it('흐릿하게 가리킨 작업 요청에는 지난 질문이 아니라 지난 작업만 후보로 보여 준다', async () => {
    const memory = new FakeMemory();
    const user = new FakeUser(true);
    const team = new FakeTeam({
      router: [route('work'), route('question'), route('work', true, '할인')],
      answerer: [() => ({ answer: '버립니다.', claims: [] })],
    });
    const chat = session({ team, memory, user });
    await chat.handle('Money에 할인 넣어줘');
    await chat.handle('할인은 원 미만을 어떻게 해?');
    await chat.handle('아까 그 할인에 음수도 막아줘');
    expect(user.pastAsked.at(-1)!.map((c) => c.title)).toEqual(['Money에 퍼센트 할인 discount 추가']);
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

describe('ChatSession — 사용 한도', () => {
  it('질문하다 구독 한도에 걸리면 한도 문장을 그대로 알린다', async () => {
    const team = new FakeTeam({ router: [route('question')] }, 'answerer');
    const turn = await session({ team }).handle('왜 floor야?');
    expect(turn).toMatchObject({ kind: 'blocked', reason: 'usage-limit', message: "You've hit your session limit · resets 9:40pm" });
  });

  it('라우터에서 한도에 걸리면 작업을 시작하지 않는다', async () => {
    const loops = new FakeLoops();
    const team = new FakeTeam({}, 'router');
    const turn = await session({ team, loops }).handle('Money에 할인 넣어줘');
    expect(turn.kind).toBe('blocked');
    expect(loops.runs).toEqual([]);
  });

  it('라우터가 로그인 안 돼 있으면 질문을 작업으로 넘기지 않고 로그인 필요를 알린다', async () => {
    const loops = new FakeLoops();
    const team = new FakeTeam({}, 'router', 'login');
    const turn = await session({ team, loops }).handle('ECS on EC2와 Fargate 차이 알려줘');
    expect(turn).toMatchObject({ kind: 'blocked', reason: 'login' });
    expect(loops.runs).toEqual([]);
    expect(team.calls.filter((c) => c.role === 'answerer').every((c) => c.signal!.aborted)).toBe(true);
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

  it('이어 간 세션은 앞 대화와 이어 일할 파일을 그대로 쓴다', async () => {
    const loops = new FakeLoops();
    const team = new FakeTeam({ router: [route('work')] });
    const first = session({ team, loops });
    await first.handle('Money에 할인 넣어줘');
    const saved = first.snapshot('2026-10-27T10:00:00.000Z');
    const resumed = ChatSession.resume(sessionDeps({ team, loops }), saved);
    await resumed.handle('에러 메시지만 바꿔줘');
    expect(loops.runs[1]!.context.conversation).toContain('Money에 할인 넣어줘');
    expect([...loops.runs[1]!.carried]).toEqual([['src/money.ts', 'modified:h1']]);
    expect(resumed.status()).toMatchObject({ turns: 2, lastTitle: 'Money에 퍼센트 할인 discount 추가' });
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
