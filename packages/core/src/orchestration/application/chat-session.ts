import type { MemoryPort } from '../../memory/application/memory.port.js';
import { recallBlock, WorkMemory, type MemoryEntry, type Recall } from '../../memory/domain/work-memory.js';
import { citedPaths, FactCheck, normalizeUrl, type CheckedClaim } from '../domain/fact-check.js';
import type { ModelTier } from '../domain/team.js';
import { AnswerDto } from './dto/answer.dto.js';
import type { MemberRole, RoleSettingsDto } from './dto/role-settings.dto.js';
import { RouteDto } from './dto/route.dto.js';
import { ANSWER_SCHEMA, ROUTE_SCHEMA } from './dto/schemas.js';
import type { RunContextBlocks, RunOutcome } from './minimal-loop.service.js';
import type { MemberResult, ProgressPort, TeamMemberPort, UserPort, WorkspacePort } from './ports.js';

export type { RunContextBlocks };

/** 팀장에게 넘길 앞 대화 턴 수와 기억 묶음 글자 수 상한 */
const CONVERSATION_TURNS = 6;
const MEMORY_CHARS = 3000;
const CANDIDATES = 3;

export type TurnOutcome =
  | { readonly kind: 'work'; readonly outcome: RunOutcome }
  | { readonly kind: 'answer'; readonly answer: string; readonly checked: readonly CheckedClaim[]; readonly costUsd: number; readonly durationMs: number };

export interface ChatSessionDeps {
  /** 요청 하나를 돌릴 최소 루프. carried = 세션 중 rauha가 남긴 파일(그 위에서 이어 일함). */
  readonly newLoop: (carried: ReadonlyMap<string, string>) => { run(request: string, context: RunContextBlocks): Promise<RunOutcome> };
  readonly team: TeamMemberPort;
  readonly workspace: Pick<WorkspacePort, 'readFile'>;
  readonly memory: MemoryPort;
  readonly user: UserPort;
  readonly progress: ProgressPort;
  readonly roles: RoleSettingsDto;
  readonly now: () => number;
  readonly newId: () => string;
  readonly today: () => string;
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

  static start(deps: ChatSessionDeps): ChatSession {
    return new ChatSession(deps);
  }

  async handle(input: string): Promise<TurnOutcome> {
    const conversation = this.conversation();
    const routed = await this.member('router', [conversation !== null ? `<conversation>\n${conversation}\n</conversation>` : '', `<message>\n${input}\n</message>`], ROUTE_SCHEMA);
    const route = RouteDto.read(routed.output);
    const past = route.refersToPast ? await this.pickPast(route.pastQuery ?? input) : null;
    return route.mode === 'question' ? this.answer(input, past) : this.work(input, conversation, past);
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

  private async answer(input: string, past: Recall | null): Promise<TurnOutcome> {
    const started = this.deps.now();
    const recalls = past !== null ? [past] : await this.deps.memory.search(input, CANDIDATES);
    const block = recallBlock(recalls, MEMORY_CHARS);
    const result = await this.member(
      'answerer',
      [`<today>${this.deps.today()}</today>`, block !== '' ? `<memory>\n기억된 지난 작업과 그때의 결정입니다.\n${block}\n</memory>` : '', `<question>\n${input}\n</question>`],
      ANSWER_SCHEMA,
    );
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
    await this.deps.memory.save(WorkMemory.fromAnswer({ id: this.deps.newId(), at: this.at(), question: input, answer, citedFiles: citedPaths(claims) }));
    this.turns.push({ input, result: `답: ${answer.slice(0, 120)}` });
    return { kind: 'answer', answer, checked, costUsd: result.usage.costUsd, durationMs: this.deps.now() - started };
  }

  // ── 지난 작업 고르기 ─────────────────────────────────────

  /** 흐릿하게 가리킨 지난 작업을 기억에서 찾아 사용자에게 고르게 한다. 하나여도 묻는다. 화면이 없으면 새 작업. */
  private async pickPast(query: string): Promise<Recall | null> {
    if (!this.deps.user.interactive) return null;
    const candidates = await this.deps.memory.search(query, CANDIDATES);
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

  private async member(role: MemberRole, parts: readonly string[], outputSchema: Record<string, unknown>): Promise<MemberResult> {
    const setting = this.deps.roles.get(role);
    this.deps.progress.step(`${role === 'router' ? '라우터' : '답변 팀원'}(${setting.tier}) 작업 중…`, role);
    const result = await this.deps.team.run({ role, setting, userMessage: parts.filter((p) => p !== '').join('\n\n'), outputSchema, canWrite: () => false });
    this.costUsd += result.usage.costUsd;
    this.calls[setting.tier] += 1;
    return result;
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
