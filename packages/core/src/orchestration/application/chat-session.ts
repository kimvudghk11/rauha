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
import { ANSWER_SCHEMA, REVIEWER_REPORT_SCHEMA, ROUTE_SCHEMA } from './dto/schemas.js';
import type { RunContextBlocks, RunOutcome } from './minimal-loop.service.js';
import type { AccountBlock, MemberResult, PreparedCall, ProgressPort, TeamMemberPort, UserPort, WorkspacePort } from './ports.js';

export type { RunContextBlocks };

/** 팀장에게 넘길 앞 대화 턴 수와 기억 묶음 글자 수 상한 */
const CONVERSATION_TURNS = 6;
const MEMORY_CHARS = 3000;
const CANDIDATES = 3;

export type TurnOutcome =
  | { readonly kind: 'work'; readonly outcome: RunOutcome }
  /** basis: 답이 읽은 기준(`main (a1b2c3d)`). 저장소 지식이 없으면 null. */
  | { readonly kind: 'answer'; readonly answer: string; readonly checked: readonly CheckedClaim[]; readonly costUsd: number; readonly durationMs: number; readonly basis: string | null }
  /** /review: 사용자의 변경을 리뷰어가 본 결과. target null = 커밋 안 한 변경. files가 비면 리뷰어를 부르지 않았다. */
  | { readonly kind: 'review'; readonly target: string | null; readonly files: readonly string[]; readonly checked: readonly CheckedClaim[]; readonly summary: string; readonly durationMs: number }
  /** 계정 문제(사용 한도, 로그인 안 됨)로 막힘. 사용 한도면 message에 풀리는 시각이 들어 있다. */
  | { readonly kind: 'blocked'; readonly reason: AccountBlock['reason']; readonly message: string };

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
}

/** 답변 팀원에게 넘길 저장소 지식 묶음과 그 기준 */
interface Known {
  readonly block: string;
  readonly basis: string;
}

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
  async handle(input: string): Promise<TurnOutcome> {
    const started = this.deps.now();
    const conversation = this.conversation();
    const early = new AbortController();
    // 저장소 지식은 라우터와 함께 읽는다. 답변 팀원만 기다린다(라우터는 지식이 필요 없다).
    const known = this.knowledgeOf();
    const asked = known.then((k) => this.askAnswerer(input, null, k, early.signal));
    // 라우터를 기다리는 동안 실패해도 처리 안 된 거절로 프로세스가 죽지 않게. 쓰기로 하면 answer()가 await에서 다시 받는다.
    asked.catch(() => undefined);
    const routed = await this.member('router', [conversation !== null ? `<conversation>\n${conversation}\n</conversation>` : '', `<message>\n${input}\n</message>`], ROUTE_SCHEMA);
    const route = RouteDto.read(routed.output);
    if (routed.blocked || route.mode === 'work' || route.refersToPast) early.abort();
    if (routed.blocked) return { kind: 'blocked', ...routed.blocked };
    const past = route.refersToPast ? await this.pickPast(route.pastQuery ?? input, route.mode) : null;
    if (route.mode === 'work') return this.work(input, conversation, past);
    return this.answer(input, route.refersToPast ? this.askAnswerer(input, past, await known) : asked, started);
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

  private async work(input: string, conversation: string | null, past: Recall | null): Promise<TurnOutcome> {
    const outcome = await this.deps.newLoop(new Map(this.carried)).run(input, { conversation, pastWork: past === null ? null : recallBlock([past], MEMORY_CHARS) });
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

  // ── 질문 ──────────────────────────────────────────────────

  /** 답변 팀원 호출만. 답을 기억에 남기는 일은 이 답을 쓰기로 정한 뒤 answer()가 한다. */
  private async askAnswerer(input: string, past: Recall | null, known: Known | null, signal?: AbortSignal): Promise<{ result: MemberResult; recalls: Recall[]; basis: string | null }> {
    const recalls = past !== null ? [past] : await this.deps.memory.search(input, CANDIDATES);
    const block = recallBlock(recalls, MEMORY_CHARS);
    const result = await this.member(
      'answerer',
      [known?.block ?? '', `<today>${this.deps.today()}</today>`, `<now>${this.deps.nowText()}</now>`, block !== '' ? `<memory>\n기억된 지난 작업과 그때의 결정입니다.\n${block}\n</memory>` : '', `<question>\n${input}\n</question>`],
      ANSWER_SCHEMA,
      signal,
    );
    return { result, recalls, basis: known?.basis ?? null };
  }

  /** 저장소 지식. 없거나(git 아님) 읽다 실패하면 null — 그때는 지식 없이 답한다. */
  private async knowledgeOf(): Promise<Known | null> {
    try {
      const known = (await this.deps.knowledge?.current()) ?? null;
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
    this.turns.push({ input, result: `답: ${answer.slice(0, 120)}` });
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
    const candidates = mode === 'work' ? continuable(await this.deps.memory.search(query, CANDIDATES * 3), CANDIDATES) : await this.deps.memory.search(query, CANDIDATES);
    if (candidates.length === 0) return null;
    const picked = await this.deps.user.pickPast(candidates.map((c) => ({ id: c.work.id, title: c.work.text.split('\n')[0]!, at: c.work.at })));
    return candidates.find((c) => c.work.id === picked) ?? null;
  }

  // ── 도움 ──────────────────────────────────────────────────

  private conversation(): string | null {
    if (this.turns.length === 0) return null;
    return this.turns
      .slice(-CONVERSATION_TURNS)
      .map((t) => `- 사용자: ${t.input}\n  결과: ${t.result}`)
      .join('\n');
  }

  private callFor(role: MemberRole, outputSchema: Record<string, unknown>): PreparedCall {
    return { role, setting: this.deps.roles.get(role), outputSchema, canWrite: () => false };
  }

  private async member(role: MemberRole, parts: readonly string[], outputSchema: Record<string, unknown>, signal?: AbortSignal): Promise<MemberResult> {
    const call = this.callFor(role, outputSchema);
    // 질문을 나누고 답하는 건 사용자에게 한 가지 일로 보이므로 누가 하는지 밝히지 않는다.
    this.deps.progress.step('작업 중…', role);
    const result = await this.deps.team.run({ ...call, userMessage: parts.filter((p) => p !== '').join('\n\n'), ...(signal !== undefined ? { signal } : {}) });
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
