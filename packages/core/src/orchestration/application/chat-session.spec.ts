import { describe, expect, it, vi } from 'vitest';
import type { DesignInput, DesignResult } from '../../design/application/design.service.js';
import { Design } from '../../design/domain/design.js';
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
  readonly calls: { role: MemberRole; message: string; signal: AbortSignal | undefined; dirs: readonly string[] | undefined; canWrite: (path: string) => boolean; tier: string }[] = [];
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
    this.calls.push({ role: call.role, message: call.userMessage, signal: call.signal, dirs: call.additionalDirectories, canWrite: call.canWrite, tier: call.setting.tier });
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

const route = (mode: 'work' | 'question' | 'task' | 'feature', refersToPast = false, pastQuery: string | null = null) => () => ({ mode, refersToPast, pastQuery });

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

describe('ChatSession — 설계 대화', () => {
  const task = (id: string, dependsOn: string[] = []) => ({ id, title: `작업 ${id}`, scope: [`src/${id}/**`], acceptance: [`${id}는 10% 쿠폰이 10,000원을 9,000원으로`], dependsOn });
  const designOf = (tasks = [task('t1'), task('t2', ['t1'])]) =>
    Design.of({
      title: '쿠폰 할인',
      purpose: '쿠폰 적용',
      goals: [],
      nonGoals: [],
      scenarios: [{ given: '10,000원', when: '10% 쿠폰', then: '9,000원' }],
      decisions: [{ what: '원 미만 버림', by: 'rauha' }],
      tasks,
      risks: [],
    });
  const cost = { calls: 3, costUsd: 0.05, tier: 'sonnet' as const };
  const approved = (design = designOf()): DesignResult => ({ kind: 'approved', design, path: 'C:/designs/a.md', cost });
  const designerThat = (result: DesignResult) => {
    const inputs: DesignInput[] = [];
    return { inputs, port: { run: async (input: DesignInput) => (inputs.push(input), result) } };
  };
  const talking = new FakeUser(true);
  Object.assign(talking, { discuss: async () => '네', approve: async () => ({ kind: 'approve' }) });
  const withDesigner = (p: SessionParts, designer: ReturnType<typeof designerThat>['port'], user: UserPort = talking) => ChatSession.start({ ...sessionDeps({ ...p, user }), designer, repoName: 'shop-api' });
  const stopped = () => outcome({ status: 'stopped', stopReason: 'halted' });

  it('기능 요청이면 설계 대화를 하고, 승인된 설계의 작업을 순서대로 최소 루프에 넣는다', async () => {
    const loops = new FakeLoops([outcome(), outcome()]);
    const designer = designerThat(approved());
    const team = new FakeTeam({ router: [route('feature')] });
    const turn = await withDesigner({ team, loops }, designer.port).handle('쿠폰 기능 만들어줘');
    expect(loops.runs.map((r) => r.request.split('\n')[0])).toEqual(['작업 t1', '작업 t2']);
    expect(loops.runs[0]!.context.design).toContain('<design');
    expect(loops.runs[0]!.context.design).toContain('C:/designs/a.md');
    expect(loops.runs[1]!.context.design).toContain('작업 t2');
    expect(turn).toMatchObject({ kind: 'design', title: '쿠폰 할인', path: 'C:/designs/a.md' });
    if (turn.kind === 'design') expect(turn.tasks.map((t) => t.status)).toEqual(['complete', 'complete']);
  });

  it('설계 팀원은 저장소 지식·기억·앞 대화를 받는다', async () => {
    const knowledge = { current: async () => ({ block: '<repo_knowledge repo="shop-api" basis="main (a1b2c3d)">요약</repo_knowledge>', basis: RepoRef.of({ branch: 'main', commit: 'a1b2c3d'.padEnd(40, '0'), dirty: false }) }), noteChanged: async () => undefined };
    const designer = designerThat(approved());
    const team = new FakeTeam({ router: [route('feature')] });
    await ChatSession.start({ ...sessionDeps({ team, loops: new FakeLoops([outcome(), outcome()]), user: talking }), designer: designer.port, knowledge, repoName: 'shop-api' }).handle('쿠폰 기능 만들어줘');
    expect(designer.inputs[0]).toMatchObject({ request: '쿠폰 기능 만들어줘', repo: 'shop-api', basis: 'main (a1b2c3d)' });
    expect(designer.inputs[0]!.knowledge).toContain('<repo_knowledge');
  });

  it('앞 작업이 멈추면 그것에 의존하는 작업은 하지 않고, 의존하지 않는 작업은 계속한다', async () => {
    const design = designOf([task('t1'), task('t2', ['t1']), task('t3')]);
    const loops = new FakeLoops([stopped(), outcome()]);
    const turn = await withDesigner({ team: new FakeTeam({ router: [route('feature')] }), loops }, designerThat(approved(design)).port).handle('쿠폰 기능 만들어줘');
    expect(loops.runs.map((r) => r.request.split('\n')[0])).toEqual(['작업 t1', '작업 t3']);
    if (turn.kind === 'design') expect(turn.tasks.map((t) => `${t.id}:${t.status}`)).toEqual(['t1:stopped', 't2:skipped', 't3:complete']);
  });

  it('설계를 그만두면 작업하지 않고 알린다', async () => {
    const loops = new FakeLoops();
    const turn = await withDesigner({ team: new FakeTeam({ router: [route('feature')] }), loops }, designerThat({ kind: 'cancelled', cost }).port).handle('쿠폰 기능 만들어줘');
    expect(loops.runs).toEqual([]);
    expect(turn.kind).toBe('notice');
  });

  it('설계를 만들지 못하면 이유를 알린다', async () => {
    const turn = await withDesigner({ team: new FakeTeam({ router: [route('feature')] }) }, designerThat({ kind: 'failed', message: '순환 의존', cost }).port).handle('쿠폰 기능 만들어줘');
    expect(turn).toMatchObject({ kind: 'notice' });
    if (turn.kind === 'notice') expect(turn.message).toContain('순환 의존');
  });

  it('구독 한도나 로그인 문제로 막히면 그대로 알린다', async () => {
    const turn = await withDesigner({ team: new FakeTeam({ router: [route('feature')] }) }, designerThat({ kind: 'blocked', block: { reason: 'login', message: 'x' }, cost }).port).handle('쿠폰 기능 만들어줘');
    expect(turn).toMatchObject({ kind: 'blocked', reason: 'login' });
  });

  it('화면이 없으면(-p) 설계 대화 없이 바로 작업으로 진행한다', async () => {
    const loops = new FakeLoops();
    const designer = designerThat(approved());
    const turn = await withDesigner({ team: new FakeTeam({ router: [route('feature')] }), loops }, designer.port, new FakeUser(false)).handle('쿠폰 기능 만들어줘');
    expect(designer.inputs).toEqual([]);
    expect(loops.runs).toHaveLength(1);
    expect(turn.kind).toBe('work');
  });

  it('/design은 라우터를 거치지 않고 바로 설계부터 한다', async () => {
    const team = new FakeTeam({});
    const designer = designerThat(approved());
    await withDesigner({ team, loops: new FakeLoops([outcome(), outcome()]) }, designer.port).handle('쿠폰 기능 만들어줘', [], 'design');
    expect(team.calls.map((c) => c.role)).not.toContain('router');
    expect(designer.inputs).toHaveLength(1);
  });

  it('여러 저장소에 걸친 기능 요청은 하지 않고 알린다', async () => {
    const loops = new FakeLoops();
    const turn = await withDesigner({ team: new FakeTeam({ router: [route('feature')] }), loops }, designerThat(approved()).port).handle('둘 다 만들어줘', [{ name: 'web', root: 'E:/w/web', knowledge: null }]);
    expect(turn.kind).toBe('notice');
    expect(loops.runs).toEqual([]);
  });

  it('설계 팀원이 쓴 호출과 비용이 사용량에 더해진다', async () => {
    const chat = withDesigner({ team: new FakeTeam({ router: [route('feature')] }), loops: new FakeLoops([outcome(), outcome()]) }, designerThat(approved()).port);
    await chat.handle('쿠폰 기능 만들어줘');
    expect(chat.usage().calls.sonnet).toBeGreaterThanOrEqual(3);
    expect(chat.usage().costUsd).toBeGreaterThanOrEqual(0.05);
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

  it('코드가 아닌 결과물(커밋을 모은 포트폴리오 .md 등)은 크기와 상관없이 받아서 문서 팀원이 만든다', async () => {
    const loops = new FakeLoops();
    const team = new FakeTeam({ router: [route('task')], writer: [() => ({ summary: '저장소 2개의 내 커밋으로 포트폴리오를 만들었어요.', files: ['docs/portfolio.md'] })] });
    const turn = await ChatSession.start({ ...sessionDeps({ team, loops }), repoName: 'shop-api' }).handle('모든 레포에서 내 커밋 확인해서 포폴 md 만들어줘', also);
    expect(loops.runs).toEqual([]);
    const call = team.calls.find((c) => c.role === 'writer')!;
    expect(call.dirs).toEqual(['E:/w/shop-web']);
    expect(call.message).toContain('shop-web');
    // 문서 팀원은 문서만 쓴다(코드는 건드리지 않는다).
    expect(call.canWrite('docs/portfolio.md')).toBe(true);
    expect(call.canWrite('src/money.ts')).toBe(false);
    expect(turn.kind).toBe('answer');
    if (turn.kind !== 'answer') return;
    expect(turn.answer).toContain('포트폴리오를 만들었어요');
    expect(turn.answer).toContain('docs/portfolio.md');
  });

  describe('작업 공간 폴더와 저장소가 많을 때', () => {
    const folder = (n: number) => ({ root: 'E:/w', repos: Array.from({ length: n }, (_, i) => ({ name: i === 0 ? 'shop-api' : `repo${i}`, root: `E:/w/${i === 0 ? 'shop-api' : `repo${i}`}` })) });
    const alsoOf = (n: number) => folder(n).repos.slice(1).map((r) => ({ name: r.name, root: r.root, knowledge: null }));
    const done = () => ({ summary: '정리했어요.', files: ['RESUME.md'] });

    it('문서 팀원은 작업 공간 폴더(저장소들의 부모)에도 쓸 수 있게 열린다', async () => {
      const team = new FakeTeam({ router: [route('task')], writer: [done] });
      await ChatSession.start({ ...sessionDeps({ team }), repoName: 'shop-api', folder: folder(3) }).handle('이력서 정리해줘', alsoOf(3));
      const call = team.calls.find((c) => c.role === 'writer')!;
      expect(call.dirs).toContain('E:/w');
      expect(call.message).toContain('<workspace root="E:/w"');
    });

    it('답변 팀원은 여러 저장소 작업 공간이면 폴더 위치와 저장소 목록을 안다 (작업 폴더를 잘못 설명하지 않게)', async () => {
      const team = new FakeTeam({ router: [route('question')], answerer: [() => ({ answer: '네.', claims: [] })] });
      await ChatSession.start({ ...sessionDeps({ team }), repoName: 'shop-api', folder: folder(3) }).handle('상위 폴더 스캔해줘', alsoOf(3));
      const message = team.calls.find((c) => c.role === 'answerer')!.message;
      expect(message).toContain('<workspace root="E:/w"');
      expect(message).toContain('repo1');
    });

    it('저장소 하나짜리 작업 공간이면 폴더 안내를 넣지 않는다', async () => {
      const team = new FakeTeam({ router: [route('question')], answerer: [() => ({ answer: '네.', claims: [] })] });
      await ChatSession.start({ ...sessionDeps({ team }), repoName: 'shop-api', folder: folder(1) }).handle('이 함수 뭐 해?');
      expect(team.calls.find((c) => c.role === 'answerer')!.message).not.toContain('<workspace');
    });

    it('저장소가 4개 넘으면 저장소마다 싼 모델이 나눠 읽고(문서는 쓰지 않음), 모은 요약으로 문서 한 번 쓴다', async () => {
      const team = new FakeTeam({ router: [route('task')], writer: [(c) => (c.userMessage.includes('<gather') ? { summary: `요약-${c.userMessage.match(/<gather repo="([^"]+)"/)![1]}`, files: [] } : done())] });
      const steps: string[] = [];
      const turn = await ChatSession.start({ ...sessionDeps({ team, steps }), repoName: 'shop-api', folder: folder(6) }).handle('모든 레포 이력서 정리', alsoOf(6));
      const writers = team.calls.filter((c) => c.role === 'writer');
      const gathers = writers.filter((c) => c.message.includes('<gather'));
      expect(gathers).toHaveLength(6);
      expect(gathers.every((c) => c.tier === 'haiku' && !c.canWrite('RESUME.md'))).toBe(true);
      // 각 저장소는 자기 폴더만 열어 읽는다.
      expect(gathers.find((c) => c.message.includes('repo3'))!.dirs).toEqual(['E:/w/repo3']);
      const last = writers.at(-1)!;
      expect(last.message).not.toContain('<gather');
      expect(last.message).toContain('<digests>');
      expect(last.message).toContain('요약-repo5');
      expect(last.tier).toBe('sonnet');
      expect(last.canWrite('RESUME.md')).toBe(true);
      expect(steps.some((s) => /저장소 읽는 중 \d+\/6/.test(s))).toBe(true);
      expect(turn.kind === 'answer' && turn.answer).toContain('RESUME.md');
    });

    it('저장소가 4개 이하면 나누지 않고 문서 팀원 한 번으로 쓴다', async () => {
      const team = new FakeTeam({ router: [route('task')], writer: [done] });
      await ChatSession.start({ ...sessionDeps({ team }), repoName: 'shop-api', folder: folder(4) }).handle('모든 레포 이력서 정리', alsoOf(4));
      expect(team.calls.filter((c) => c.role === 'writer')).toHaveLength(1);
    });
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

  it('지식을 늦게 읽는 사이 작업으로 판정돼 이미 멈춘 답변은 뒤늦게 시작하지 않는다 (작업 중 표시가 남지 않게)', async () => {
    let release = () => {};
    const slow = { current: () => new Promise<null>((resolve) => (release = () => resolve(null))), noteChanged: async () => undefined };
    const team = new FakeTeam({ router: [route('work')] });
    const steps: string[] = [];
    await ChatSession.start({ ...sessionDeps({ team, steps }), knowledge: slow }).handle('Money에 할인 넣어줘');
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(team.calls.some((c) => c.role === 'answerer')).toBe(false);
    expect(steps).toEqual(['작업 중…']);
  });

  it('저장소가 많은 질문은 다른 저장소의 지식을 미리 만들지 않는다 (조사 팀원을 수십 번 부르지 않게)', async () => {
    const touched: string[] = [];
    const spy = (name: string) => ({ current: async () => (touched.push(name), null), noteChanged: async () => undefined });
    const repos = Array.from({ length: 5 }, (_, i) => ({ name: `r${i}`, root: `E:/w/r${i}`, knowledge: spy(`r${i}`) }));
    const ask = (also: typeof repos) => ChatSession.start({ ...sessionDeps({ team: new FakeTeam({ router: [route('question')], answerer: [() => ({ answer: '네.', claims: [] })] }) }), repoName: 'a' }).handle('비교해줘', also);
    await ask(repos);
    expect(touched).toEqual([]);
    await ask(repos.slice(0, 3));
    expect(touched.sort()).toEqual(['r0', 'r1', 'r2']);
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
