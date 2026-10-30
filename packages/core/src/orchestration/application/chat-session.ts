import type { DesignPort } from '../../design/application/design.service.js';
import { DesignDocDto } from '../../design/application/dto/design.dto.js';
import type { KnowledgePort } from '../../knowledge/application/ports.js';
import type { MemoryPort } from '../../memory/application/memory.port.js';
import { continuable, recallBlock, WorkMemory, type MemoryEntry, type Recall } from '../../memory/domain/work-memory.js';
import { citedPaths, FactCheck, normalizeUrl, type CheckedClaim } from '../domain/fact-check.js';
import type { ModelTier } from '../domain/team.js';
import { AnswerDto } from './dto/answer.dto.js';
import type { MemberRole, RoleSettingsDto } from './dto/role-settings.dto.js';
import type { ChatSnapshot } from './dto/chat-snapshot.dto.js';
import { FilesBlockDto } from './dto/files-block.dto.js';
import { ReviewReportDto } from './dto/review-report.dto.js';
import { RouteDto, type Route } from './dto/route.dto.js';
import { ANSWER_SCHEMA, REVIEWER_REPORT_SCHEMA, ROUTE_SCHEMA, WRITER_SCHEMA } from './dto/schemas.js';
import { WriterReportDto } from './dto/writer-report.dto.js';
import type { RunContextBlocks, RunOutcome } from './minimal-loop.service.js';
import type { AccountBlock, MemberResult, PreparedCall, ProgressPort, TeamMemberPort, UserPort, WorkspacePort } from './ports.js';

export type { RunContextBlocks };

/** 팀장에게 넘길 앞 대화 턴 수와 기억 묶음 글자 수 상한 */
const CONVERSATION_TURNS = 6;
/** 결과 글을 얼마나 남기고 넘기는지. 바로 앞 턴은 길게("두 번째 거 더 자세히"가 가리키는 곳이 거기다), 그 전은 짧게. */
const KEPT_RESULT_CHARS = 1200;
const OLDER_RESULT_CHARS = 300;
const MEMORY_CHARS = 3000;
const CANDIDATES = 3;

export type TurnOutcome =
  | { readonly kind: 'work'; readonly outcome: RunOutcome }
  /** basis: 답이 읽은 기준(`main (a1b2c3d)`). 저장소 지식이 없으면 null. */
  | { readonly kind: 'answer'; readonly answer: string; readonly checked: readonly CheckedClaim[]; readonly costUsd: number; readonly durationMs: number; readonly basis: string | null }
  /** /review: 사용자의 변경을 리뷰어가 본 결과. target null = 커밋 안 한 변경. files가 비면 리뷰어를 부르지 않았다. */
  | { readonly kind: 'review'; readonly target: string | null; readonly files: readonly string[]; readonly checked: readonly CheckedClaim[]; readonly summary: string; readonly durationMs: number }
  /** 설계 대화로 승인받은 설계와 그 작업들의 결과 */
  | { readonly kind: 'design'; readonly title: string; readonly path: string; readonly tasks: readonly DesignTaskResult[]; readonly durationMs: number }
  /** 팀원을 부르지 않고 알릴 것(예: 여러 저장소를 한 번에 고치는 요청). */
  | { readonly kind: 'notice'; readonly message: string }
  /** 계정 문제(사용 한도, 로그인 안 됨)로 막힘. 사용 한도면 message에 풀리는 시각이 들어 있다. */
  | { readonly kind: 'blocked'; readonly reason: AccountBlock['reason']; readonly message: string };

/** 설계가 나눈 작업 하나의 결과. skipped: 앞 작업이 멈춰 하지 않았다. */
export interface DesignTaskResult {
  readonly id: string;
  readonly title: string;
  readonly status: 'complete' | 'stopped' | 'skipped';
  readonly outcome: RunOutcome | null;
}

export interface ChatSessionDeps {
  /** 요청 하나를 돌릴 최소 루프. carried = 세션 중 rauha가 남긴 파일(그 위에서 이어 일함). */
  readonly newLoop: (carried: ReadonlyMap<string, string>) => { run(request: string, context: RunContextBlocks): Promise<RunOutcome> };
  readonly team: TeamMemberPort;
  readonly workspace: Pick<WorkspacePort, 'readFile' | 'reviewChanges'>;
  readonly memory: MemoryPort;
  readonly user: UserPort;
  readonly progress: ProgressPort;
  readonly roles: RoleSettingsDto;
  readonly now: () => number;
  readonly newId: () => string;
  readonly today: () => string;
  /** 지금 날짜와 시각을 사람이 읽는 글로(시간대 포함). 컴퓨터 시계에서 읽은 값이라 답변 팀원이 그대로 쓴다. */
  readonly nowText: () => string;
  /** 저장소 지식. 있으면 답변 팀원 메시지 맨 앞에 넣고 답에 기준을 밝힌다. 라우터에는 넣지 않는다. */
  readonly knowledge?: KnowledgePort;
  /** 작업 공간에서 이 세션의 저장소 이름. 여러 저장소 답의 기준에 쓴다. */
  readonly repoName?: string;
  /** 작업 공간 폴더(rauha를 띄운 폴더)와 그 안의 저장소들. 저장소가 둘 이상이면 답변·문서 팀원에게 알려 폴더 위치를 잘못 말하지 않게 한다. */
  readonly folder?: { readonly root: string; readonly repos: readonly { readonly name: string; readonly root: string }[] } | undefined;
  /** 설계 대화. 없거나 사용자와 주고받을 화면이 없으면 기능 요청도 바로 작업으로 진행한다. */
  readonly designer?: DesignPort | undefined;
}

/** 저장소가 이 수를 넘으면 문서 팀원 한 명이 다 읽지 않고, 저장소마다 나눠 읽은 요약을 모아 쓴다. */
const GATHER_ABOVE = 4;
/** 저장소를 나눠 읽을 때 동시에 돌리는 수 */
const GATHER_PARALLEL = 4;
/** 함께 묻는 다른 저장소가 이 수를 넘으면 그 저장소들의 지식은 미리 만들지 않는다(저장소마다 조사 팀원이 돌아 오래 걸린다). 답변 팀원이 직접 읽는다. */
const ALSO_KNOWLEDGE_MAX = 3;

/** 라우터가 작업으로 판정해 멈춘 뒤에 뒤늦게 시작하려던 답변. 아무 일도 하지 않은 것으로 돌려준다. */
const STOPPED: MemberResult = {
  output: null,
  error: '멈춘 답변',
  fetched: [],
  usage: { model: 'sonnet', durationMs: 0, costUsd: 0, turns: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, denials: [], endReason: 'error' },
};

interface MemberOptions {
  readonly signal?: AbortSignal | undefined;
  readonly dirs?: readonly string[];
  readonly canWrite?: (path: string) => boolean;
  /** 역할 기본 모델 대신 쓸 모델(저장소를 나눠 읽는 일은 싼 모델로) */
  readonly tier?: ModelTier;
  /** 진행 줄에 "작업 중…"을 내지 않는다(여러 호출을 묶어 따로 진행을 알릴 때) */
  readonly quiet?: boolean;
}

/** 답변 팀원에게 넘길 저장소 지식 묶음과 그 기준 */
interface Known {
  readonly block: string;
  readonly basis: string;
}

/** 여러 저장소에 걸친 질문에서 함께 읽을 다른 저장소 */
export interface AlsoRepo {
  readonly name: string;
  readonly root: string;
  readonly knowledge: KnowledgePort | null;
}

/** 함께 읽을 저장소와 그 지식(없으면 null) */
interface AlsoKnown {
  readonly name: string;
  readonly root: string;
  readonly known: Known | null;
}

const MANY_REPO_WORK = '여러 저장소를 한 번에 고치는 일은 아직 하지 않아요. 저장소마다 나눠서 요청해 주세요.';

interface Turn {
  readonly input: string;
  readonly result: string;
}

/** 끝난 실행 → 기억 그래프 점과 선. 대화 세션과 한 번 실행(-p)이 같은 규칙으로 남긴다. */
export function workMemoryFrom(outcome: RunOutcome, p: { id: string; at: string; request: string; extendsWork: string | null }): MemoryEntry {
  return WorkMemory.fromWork({
    id: p.id,
    at: p.at,
    title: outcome.title,
    request: p.request,
    status: outcome.status,
    changedFiles: outcome.changedInRun.filter((c) => c.kind !== 'deleted').map((c) => c.path),
    lockedTests: outcome.lockedTests,
    decisions: outcome.facts.checked.filter((c) => c.kind === 'decision').map((c) => ({ text: c.text, verified: !c.isGuess, rejected: null })),
    assumptions: outcome.assumptions.map((a) => ({ question: a.question, chosen: a.chosen })),
    extendsWork: p.extendsWork,
    basis: outcome.basis,
  });
}

/**
 * 대화 모드 한 세션. 입력마다 라우터가 작업/질문을 가르고, 작업은 최소 루프로, 질문은 답변 팀원으로 보낸다.
 * 끝난 일은 기억 그래프에 남긴다. /clear는 세션 대화만 비우고 기억과 이어 일할 파일은 둔다.
 */
export class ChatSession {
  private turns: Turn[] = [];
  /** 세션 중 rauha가 바꾼 파일 → 마지막으로 남긴 내용 값 */
  private carried = new Map<string, string>();
  private costUsd = 0;
  private readonly calls: Record<ModelTier, number> = { haiku: 0, sonnet: 0, opus: 0 };
  private lastTitle: string | null = null;

  private constructor(private readonly deps: ChatSessionDeps) {}

  /** 매 입력마다 부르는 라우터·답변 팀원은 미리 띄워 둔다(띄우는 데만 2초쯤 걸린다). */
  static start(deps: ChatSessionDeps): ChatSession {
    const session = new ChatSession(deps);
    deps.team.prepare?.(session.callFor('router', ROUTE_SCHEMA));
    deps.team.prepare?.(session.callFor('answerer', ANSWER_SCHEMA));
    return session;
  }

  /** 저장해 둔 대화를 이어 연다(rauha --continue, /update 뒤). 앞 대화와 이어 일할 파일을 그대로 쓴다. */
  static resume(deps: ChatSessionDeps, snapshot: ChatSnapshot): ChatSession {
    const session = ChatSession.start(deps);
    session.turns = snapshot.turns.map((t) => ({ input: t.input, result: t.result }));
    session.carried = new Map(snapshot.carried);
    session.lastTitle = snapshot.lastTitle;
    return session;
  }

  /** 다시 열 때 필요한 상태. savedAt: ISO 시각 */
  snapshot(savedAt: string): ChatSnapshot {
    return { version: 1, turns: [...this.turns], carried: [...this.carried], lastTitle: this.lastTitle, savedAt };
  }

  /**
   * 라우터의 판정을 기다리지 않고 답변 팀원도 함께 시작한다. 질문이면 판정 시간만큼 빨리 답하고,
   * 작업이거나 지난 작업을 골라야 하는 질문이면 미리 시작한 답변은 멈추고 버린다.
   */
  async handle(input: string, also: readonly AlsoRepo[] = [], force?: 'design'): Promise<TurnOutcome> {
    const started = this.deps.now();
    const conversation = this.conversation();
    // /design: 라우터를 거치지 않고 바로 설계부터 한다.
    if (force === 'design') {
      if (also.length > 0) return { kind: 'notice', message: MANY_REPO_WORK };
      return this.canDesign() ? this.feature(input, conversation, started) : { kind: 'notice', message: '설계 대화는 터미널 대화 모드에서만 할 수 있어요.' };
    }
    const early = new AbortController();
    // 저장소 지식은 라우터와 함께 읽는다. 답변 팀원만 기다린다(라우터는 지식이 필요 없다).
    const known = this.knowledgeOf();
    const others = Promise.all(also.map(async (r): Promise<AlsoKnown> => ({ name: r.name, root: r.root, known: also.length <= ALSO_KNOWLEDGE_MAX ? await this.knowledgeOf(r.knowledge) : null })));
    const asked = Promise.all([known, others]).then(([k, o]) => this.askAnswerer(input, null, k, conversation, early.signal, o));
    // 라우터를 기다리는 동안 실패해도 처리 안 된 거절로 프로세스가 죽지 않게. 쓰기로 하면 answer()가 await에서 다시 받는다.
    asked.catch(() => undefined);
    const routed = await this.member('router', [conversation !== null ? `<conversation>\n${conversation}\n</conversation>` : '', `<message>\n${input}\n</message>`], ROUTE_SCHEMA, {});
    const route = RouteDto.read(routed.output);
    if (routed.blocked || route.mode !== 'question' || route.refersToPast) early.abort();
    if (routed.blocked) return { kind: 'blocked', ...routed.blocked };
    if (route.mode === 'task') return this.task(input, conversation, also, started);
    const changesCode = route.mode === 'work' || route.mode === 'feature';
    if (changesCode && also.length > 0) return { kind: 'notice', message: MANY_REPO_WORK };
    const past = route.refersToPast ? await this.pickPast(route.pastQuery ?? input, route.mode) : null;
    // 기능 요청은 설계 대화부터. 사용자와 주고받을 화면이 없으면(-p) 작업으로 바로 진행한다.
    if (route.mode === 'feature' && past === null && this.canDesign()) return this.feature(input, conversation, started);
    if (changesCode) return this.work(input, conversation, past);
    return this.answer(input, route.refersToPast ? this.askAnswerer(input, past, await known, conversation, undefined, await others) : asked, started);
  }

  clear(): void {
    this.turns = [];
  }

  status(): { turns: number; carriedFiles: number; lastTitle: string | null } {
    return { turns: this.turns.length, carriedFiles: this.carried.size, lastTitle: this.lastTitle };
  }

  usage(): { costUsd: number; calls: Readonly<Record<ModelTier, number>> } {
    return { costUsd: this.costUsd, calls: { ...this.calls } };
  }

  // ── 작업 ──────────────────────────────────────────────────

  private async work(input: string, conversation: string | null, past: Recall | null, design: string | null = null): Promise<TurnOutcome> {
    const outcome = await this.deps.newLoop(new Map(this.carried)).run(input, { conversation, pastWork: past === null ? null : recallBlock([past], MEMORY_CHARS), design });
    this.costUsd += outcome.costUsd;
    for (const tier of Object.keys(this.calls) as ModelTier[]) this.calls[tier] += outcome.usage[tier].calls;

    // 세션 중 바뀐 파일만 이어 일할 대상으로 남긴다(사용자가 원래 바꿔 둔 파일은 넣지 않는다).
    const touched = new Set([...this.carried.keys(), ...outcome.changedInRun.map((c) => c.path)]);
    this.carried = new Map([...touched].filter((p) => outcome.snapshotAfter.has(p)).map((p) => [p, outcome.snapshotAfter.get(p)!]));

    await this.deps.memory.save(workMemoryFrom(outcome, { id: this.deps.newId(), at: this.at(), request: input, extendsWork: past?.work.id ?? null }));
    this.lastTitle = outcome.title;
    this.turns.push({ input, result: `작업 "${outcome.title}" ${outcome.status === 'complete' ? '완료' : `멈춤(${outcome.stopReason})`}, 바뀐 파일 ${outcome.changedInRun.map((c) => c.path).join(', ') || '없음'}` });
    return { kind: 'work', outcome };
  }

  // ── 설계 대화 ─────────────────────────────────────────────

  private canDesign(): boolean {
    return this.deps.designer !== undefined && this.deps.user.interactive && typeof this.deps.user.discuss === 'function';
  }

  /**
   * 기능 요청: 설계 팀원과 충분히 이야기해 설계를 승인받고, 승인된 설계의 작업을 순서대로 최소 루프에 넣는다.
   * 앞 작업이 멈추면 그것에 의존하는 작업은 하지 않고, 의존하지 않는 작업은 계속한다.
   * 승인 뒤의 접수는 설계 블록을 기준으로 거의 묻지 않는다.
   */
  private async feature(input: string, conversation: string | null, started: number): Promise<TurnOutcome> {
    const known = await this.knowledgeOf();
    const recalls = await this.deps.memory.search(input, CANDIDATES);
    const memory = recallBlock(recalls, MEMORY_CHARS);
    const result = await this.deps.designer!.run({
      request: input,
      repo: this.deps.repoName ?? '이 저장소',
      knowledge: known?.block ?? null,
      memory: memory !== '' ? `<memory>\n기억된 지난 작업과 그때의 결정입니다.\n${memory}\n</memory>` : null,
      conversation,
      basis: known?.basis ?? null,
    });
    this.costUsd += result.cost.costUsd;
    this.calls[result.cost.tier] += result.cost.calls;
    if (result.kind === 'blocked') return { kind: 'blocked', ...result.block };
    if (result.kind === 'cancelled') {
      this.turns.push({ input, result: '설계를 그만둠' });
      return { kind: 'notice', message: '설계를 그만뒀어요. 필요하면 다시 말씀해 주세요.' };
    }
    if (result.kind === 'failed') return { kind: 'notice', message: `설계를 끝내지 못했어요: ${result.message} 요청을 조금 더 구체적으로 다시 해 주세요.` };

    const { design, path } = result;
    // 설계의 이유를 기억에 남긴다. 나중에 질문에 설계의 이유로 답할 수 있다(작업 기억은 작업마다 따로 남는다).
    const decided = design.decisions.map((d) => `- ${d.what} (${d.by === 'user' ? '사용자가 정함' : 'rauha가 정함'})`);
    await this.deps.memory.save(
      WorkMemory.fromAnswer({ id: this.deps.newId(), at: this.at(), question: `설계 ${design.title}: ${input}`, answer: [design.purpose, ...decided].join('\n'), citedFiles: [], basis: known?.basis ?? null }),
    );
    const order = design.runOrder();
    const results: DesignTaskResult[] = [];
    const stopped = new Set<string>();
    for (const [i, task] of order.entries()) {
      if (design.isBlocked(task.id, stopped)) {
        stopped.add(task.id);
        results.push({ id: task.id, title: task.title, status: 'skipped', outcome: null });
        continue;
      }
      this.deps.progress.step(`설계 작업 ${i + 1}/${order.length}: ${task.title}`);
      const { request, block } = DesignDocDto.taskRequest(design, task, path);
      const turn = await this.work(request, null, null, block);
      const outcome = turn.kind === 'work' ? turn.outcome : null;
      const complete = outcome?.status === 'complete';
      if (!complete) stopped.add(task.id);
      results.push({ id: task.id, title: task.title, status: complete ? 'complete' : 'stopped', outcome });
    }
    this.turns.push({ input, result: `설계 "${design.title}" 작업 ${results.filter((r) => r.status === 'complete').length}/${results.length}개 완료` });
    return { kind: 'design', title: design.title, path, tasks: results, durationMs: this.deps.now() - started };
  }

  // ── 문서 작업 ─────────────────────────────────────────────

  /**
   * 코드가 아닌 결과물(포트폴리오·보고서·정리 문서). 테스트로 확인할 것이 없어 TDD 대신 문서 팀원이 읽고 쓴다.
   * 크기로 돌려보내지 않는다. 문서 팀원은 .md만 쓸 수 있다.
   */
  private async task(input: string, conversation: string | null, also: readonly AlsoRepo[], started: number): Promise<TurnOutcome> {
    const current = this.deps.repoName ?? '이 저장소';
    const repos = [`- ${current} (지금 작업 폴더, 문서는 여기에)`, ...also.map((r) => `- ${r.name}: ${r.root}`)];
    const folderRoot = this.deps.folder?.root;
    const dirs = [...also.map((r) => r.root), ...(folderRoot !== undefined ? [folderRoot] : [])];

    let digests = '';
    if (also.length + 1 > GATHER_ABOVE) {
      const gathered = await this.gather(input, [{ name: current, root: this.deps.folder?.repos.find((r) => r.name === current)?.root ?? null }, ...also]);
      if ('blocked' in gathered) return { kind: 'blocked', ...gathered.blocked };
      digests = gathered.digests;
    }
    const result = await this.member(
      'writer',
      [
        conversation !== null ? `<conversation>\n${conversation}\n</conversation>` : '',
        `<today>${this.deps.today()}</today>`,
        this.workspaceBlock(),
        `<repos>\n${repos.join('\n')}\n</repos>`,
        digests !== '' ? `<digests>\n${digests}\n</digests>` : '',
        `<request>\n${input}\n</request>`,
      ],
      WRITER_SCHEMA,
      { dirs, canWrite: (path) => /\.md$/i.test(path) },
    );
    if (result.blocked) return { kind: 'blocked', ...result.blocked };
    const report = WriterReportDto.read(result.output);
    const answer = report.toAnswer();
    await this.deps.memory.save(WorkMemory.fromAnswer({ id: this.deps.newId(), at: this.at(), question: input, answer, citedFiles: report.files, basis: null }));
    this.lastTitle = input.slice(0, 60);
    this.turns.push({ input, result: `문서: ${report.files.join(', ') || '없음'}` });
    return { kind: 'answer', answer, checked: [], costUsd: result.usage.costUsd, durationMs: this.deps.now() - started, basis: null };
  }

  /**
   * 저장소가 많은 문서 요청: 저장소마다 싼 모델이 자기 저장소만 읽고 요약을 낸다(동시에 몇 개씩).
   * 문서 팀원 한 명이 수십 개를 다 읽다 시간·턴이 모자라는 것을 피한다. 읽지 못한 저장소는 표시해서 넘긴다.
   */
  private async gather(
    input: string,
    repos: readonly { name: string; root: string | null }[],
  ): Promise<{ digests: string } | { blocked: NonNullable<MemberResult['blocked']> }> {
    const digests: string[] = new Array(repos.length).fill('');
    let blocked: MemberResult['blocked'] = undefined;
    let next = 0;
    let finished = 0;
    const worker = async () => {
      while (blocked === undefined) {
        const at = next;
        next += 1;
        const repo = repos[at];
        if (repo === undefined) return;
        const result = await this.member(
          'writer',
          [
            `<today>${this.deps.today()}</today>`,
            `<gather repo="${repo.name}"${repo.root !== null ? ` root="${repo.root}"` : ''}/>`,
            `<request>\n${input}\n</request>`,
          ],
          WRITER_SCHEMA,
          { dirs: repo.root !== null ? [repo.root] : [], canWrite: () => false, tier: 'haiku', quiet: true },
        );
        if (result.blocked) {
          blocked = result.blocked;
          return;
        }
        const report = WriterReportDto.read(result.output);
        digests[at] = `<repo name="${repo.name}">\n${result.output === null ? '(읽지 못했어요)' : report.summary}\n</repo>`;
        finished += 1;
        this.deps.progress.step(`저장소 읽는 중 ${finished}/${repos.length}`, 'writer');
      }
    };
    await Promise.all(Array.from({ length: Math.min(GATHER_PARALLEL, repos.length) }, worker));
    return blocked !== undefined ? { blocked } : { digests: digests.join('\n') };
  }

  /** 여러 저장소 작업 공간에서 rauha를 띄운 폴더와 저장소 목록. 저장소가 하나뿐이면 빈 글. */
  private workspaceBlock(): string {
    const folder = this.deps.folder;
    if (folder === undefined || folder.repos.length < 2) return '';
    return `<workspace root="${folder.root}">\n이 폴더 아래의 저장소 ${folder.repos.length}개: ${folder.repos.map((r) => r.name).join(', ')}\n</workspace>`;
  }

  // ── 질문 ──────────────────────────────────────────────────

  /** 답변 팀원 호출만. 답을 기억에 남기는 일은 이 답을 쓰기로 정한 뒤 answer()가 한다. */
  private async askAnswerer(
    input: string,
    past: Recall | null,
    known: Known | null,
    conversation: string | null,
    signal?: AbortSignal,
    others: readonly AlsoKnown[] = [],
  ): Promise<{ result: MemberResult; recalls: Recall[]; basis: string | null }> {
    // 지식을 읽는 사이 라우터가 작업이라고 판정해 이미 멈췄으면 시작하지 않는다("작업 중" 표시가 끌 곳 없이 남는다).
    if (signal?.aborted === true) return { result: STOPPED, recalls: [], basis: null };
    const recalls = past !== null ? [past] : await this.deps.memory.search(input, CANDIDATES);
    const block = recallBlock(recalls, MEMORY_CHARS);
    const result = await this.member(
      'answerer',
      [
        known?.block ?? '',
        ...others.map((o) => o.known?.block ?? `<repo name="${o.name}" root="${o.root}"/>`),
        this.workspaceBlock(),
        conversation !== null ? `<conversation>\n${conversation}\n</conversation>` : '',
        `<today>${this.deps.today()}</today>`, `<now>${this.deps.nowText()}</now>`, block !== '' ? `<memory>\n기억된 지난 작업과 그때의 결정입니다.\n${block}\n</memory>` : '', `<question>\n${input}\n</question>`],
      ANSWER_SCHEMA,
      // 여러 저장소를 함께 묻는 질문에는 작업 공간 폴더도 열어 준다("상위 폴더를 스캔해줘").
      { signal, dirs: [...others.map((o) => o.root), ...(others.length > 0 && this.deps.folder !== undefined ? [this.deps.folder.root] : [])] },
    );
    const basis =
      others.length === 0
        ? (known?.basis ?? null)
        : [`${this.deps.repoName ?? '이 저장소'}: ${known?.basis ?? '기준 모름'}`, ...others.map((o) => `${o.name}: ${o.known?.basis ?? '기준 모름'}`)].join(', ');
    return { result, recalls, basis };
  }

  /** 저장소 지식. 없거나(git 아님) 읽다 실패하면 null — 그때는 지식 없이 답한다. */
  private async knowledgeOf(port: KnowledgePort | null | undefined = this.deps.knowledge): Promise<Known | null> {
    try {
      const known = (await port?.current()) ?? null;
      return known === null ? null : { block: known.block, basis: known.basis.label() };
    } catch {
      return null;
    }
  }

  private async answer(input: string, asked: Promise<{ result: MemberResult; recalls: Recall[]; basis: string | null }>, started: number): Promise<TurnOutcome> {
    const { result, recalls, basis } = await asked;
    if (result.blocked) return { kind: 'blocked', ...result.blocked };
    const dto = this.readAnswer(result.output);
    const claims = dto?.claims() ?? [];
    const files = new Map(await Promise.all(citedPaths(claims).map(async (path) => [path, await this.deps.workspace.readFile(path)] as const)));
    const checked = FactCheck.of(claims, {
      files,
      passedTests: [],
      fetched: new Map(result.fetched.map((p) => [normalizeUrl(p.url), p.body])),
      userStatements: [],
      records: recalls.flatMap((r) => r.neighbors.filter((n) => n.kind === 'decision' || n.kind === 'assumption').map((n) => n.text)),
    }).all();
    const answer = dto?.answer ?? '답을 만들지 못했어요. 질문을 조금 더 구체적으로 다시 해 주세요.';
    await this.deps.memory.save(WorkMemory.fromAnswer({ id: this.deps.newId(), at: this.at(), question: input, answer, citedFiles: citedPaths(claims), basis }));
    this.turns.push({ input, result: `답: ${answer.slice(0, KEPT_RESULT_CHARS)}` });
    return { kind: 'answer', answer, checked, costUsd: result.usage.costUsd, durationMs: this.deps.now() - started, basis };
  }

  // ── 내 변경 검토 (/review) ───────────────────────────────

  /** 사용자가 만든 변경을 리뷰어에게 보이고, 지적의 근거는 rauha가 확인한다. 파일은 고치지 않고 기억에도 남기지 않는다. */
  async review(target: string | null): Promise<TurnOutcome> {
    const started = this.deps.now();
    const changes = await this.deps.workspace.reviewChanges(target);
    const files = changes.map((c) => c.path);
    if (changes.length === 0) return { kind: 'review', target, files, checked: [], summary: '', durationMs: this.deps.now() - started };

    const present = changes.filter((c) => c.kind !== 'deleted').map((c) => c.path);
    const contents = await Promise.all(present.map(async (path) => ({ path, content: await this.deps.workspace.readFile(path) })));
    const result = await this.member(
      'reviewer',
      [
        `<today>${this.deps.today()}</today>`,
        `<review_request>\n${target === null ? '커밋하지 않은 변경' : `${target}와 갈라진 뒤의 변경`}을 검토해 달라는 사용자 요청입니다.\n</review_request>`,
        `<changed_files>\n${changes.map((c) => `${c.kind} ${c.path}`).join('\n')}\n</changed_files>`,
        FilesBlockDto.of(contents).toBlock(),
        '<task>사용자가 직접 만든 변경을 검토하세요. 업무 지시서는 없습니다. 파일은 고치지 않습니다.</task>',
      ],
      REVIEWER_REPORT_SCHEMA,
      {},
    );
    if (result.blocked) return { kind: 'blocked', ...result.blocked };
    const report = this.readReview(result.output);
    const claims = report?.claims() ?? [];
    const cited = new Map(await Promise.all(citedPaths(claims).map(async (path) => [path, await this.deps.workspace.readFile(path)] as const)));
    const checked = FactCheck.of(claims, {
      files: cited,
      passedTests: [],
      fetched: new Map(result.fetched.map((p) => [normalizeUrl(p.url), p.body])),
      userStatements: [],
      records: [],
    }).all();
    this.turns.push({ input: target === null ? '/review' : `/review ${target}`, result: `검토: 근거가 확인된 지적 ${checked.filter((c) => !c.isGuess).length}개` });
    return { kind: 'review', target, files, checked, summary: report?.summary ?? '리뷰 결과를 읽지 못했어요.', durationMs: this.deps.now() - started };
  }

  // ── 지난 작업 고르기 ─────────────────────────────────────

  /** 흐릿하게 가리킨 지난 작업을 기억에서 찾아 사용자에게 고르게 한다. 하나여도 묻는다. 화면이 없으면 새 작업. */
  private async pickPast(query: string, mode: Route['mode']): Promise<Recall | null> {
    if (!this.deps.user.interactive) return null;
    // 작업이면 질문·답을 걸러 낸 뒤에도 후보가 남도록 넉넉히 찾는다.
    const candidates = mode === 'work' || mode === 'feature' ? continuable(await this.deps.memory.search(query, CANDIDATES * 3), CANDIDATES) : await this.deps.memory.search(query, CANDIDATES);
    if (candidates.length === 0) return null;
    const picked = await this.deps.user.pickPast(candidates.map((c) => ({ id: c.work.id, title: c.work.text.split('\n')[0]!, at: c.work.at })));
    return candidates.find((c) => c.work.id === picked) ?? null;
  }

  // ── 도움 ──────────────────────────────────────────────────

  private conversation(): string | null {
    if (this.turns.length === 0) return null;
    const recent = this.turns.slice(-CONVERSATION_TURNS);
    return recent
      .map((t, i) => `- 사용자: ${t.input}\n  결과: ${i === recent.length - 1 ? t.result : t.result.slice(0, OLDER_RESULT_CHARS)}`)
      .join('\n');
  }

  private callFor(role: MemberRole, outputSchema: Record<string, unknown>, canWrite: (path: string) => boolean = () => false, tier?: ModelTier): PreparedCall {
    return { role, setting: tier === undefined ? this.deps.roles.get(role) : this.deps.roles.forAssignment(role, tier), outputSchema, canWrite };
  }

  private async member(role: MemberRole, parts: readonly string[], outputSchema: Record<string, unknown>, options: MemberOptions): Promise<MemberResult> {
    const call = this.callFor(role, outputSchema, options.canWrite, options.tier);
    const additionalDirectories = options.dirs ?? [];
    // 질문을 나누고 답하는 건 사용자에게 한 가지 일로 보이므로 누가 하는지 밝히지 않는다.
    if (options.quiet !== true) this.deps.progress.step('작업 중…', role);
    const result = await this.deps.team.run({
      ...call,
      userMessage: parts.filter((p) => p !== '').join('\n\n'),
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
      ...(additionalDirectories.length > 0 ? { additionalDirectories } : {}),
    });
    this.costUsd += result.usage.costUsd;
    this.calls[call.setting.tier] += 1;
    return result;
  }

  private readReview(output: unknown): ReviewReportDto | null {
    try {
      return ReviewReportDto.from(output);
    } catch {
      return null;
    }
  }

  private readAnswer(output: unknown): AnswerDto | null {
    try {
      return AnswerDto.from(output);
    } catch {
      return null;
    }
  }

  private at(): string {
    return new Date(this.deps.now()).toISOString();
  }
}
