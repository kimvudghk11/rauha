# 1단계 최소 루프 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `rauha -p "<요청>"` 한 번으로 접수 → Red(테스트 팀원) → Green(구현 주니어) → 검증 → 읽기 안내서까지 돌리고, `rauha bench`로 고정 요청 묶음을 비교한다.

**Architecture:** 순서와 판정은 `WorkOrder` 상태 머신과 새 값 객체(`RunScope`, `Verification`, `ToolRisk`)가 맡는다. `MinimalLoopService`는 포트(팀원, 작업 공간, 검사, 기록)를 불러 결과를 엔티티 메서드에 넘기기만 한다. Agent SDK, git, 명령 실행, 파일 기록은 infrastructure 어댑터에 둔다.

**Tech Stack:** TypeScript (NodeNext ESM), Yarn 4 workspaces, vitest 3, `@anthropic-ai/claude-agent-sdk` 0.3.296, `smol-toml` 1.9.1.

**Spec:** `docs/superpowers/specs/2026-10-25-step1-minimal-loop-design.md`

## Global Constraints

- yarn만 쓴다. 끝내기 전에 `yarn typecheck`와 `yarn test`가 통과해야 한다.
- domain은 Node·SDK·파일을 import하지 않는다. 생성자는 `private`이고 정적 팩토리로만 만든다. setter는 쓰지 않는다.
- 규칙을 바꿀 때는 실패하는 `*.spec.ts`부터 쓴다. 테스트 이름은 한국어 규칙 문장으로 쓴다.
- 모델 ID: `claude-haiku-5-5` / `claude-sonnet-5-5` / `claude-opus-5-5`.
- rauha는 커밋하지 않는다. `git commit`과 `git push`는 항상 거절한다.
- 위험 동작은 묻는다(git 쓰기, 파일 지우기, 폴더 밖 쓰기, 전역 설치, publish, sudo). 묻는 화면이 없으면 거절한다.
- 작업 트리에 커밋하지 않은 변경이 있으면 `-p`를 시작하지 않는다(bench 복사본은 예외).
- 구독 토큰은 읽지도 옮기지도 않는다. 계정은 `CLAUDE_CONFIG_DIR`로만 구분한다.
- 팀원 프롬프트에 rauha 자체의 DDD 스타일을 넣지 않는다.
- 이 작업 중에는 커밋하지 않는다(사용자가 직접 커밋한다).

## Review Focus

1. Windows 경로(`E:\x\y`, 역슬래시)가 Edit/Write 경로 검사와 폴더 밖 판정에서 틀리지 않아야 한다. ToolRisk spec에 Windows 경로 케이스를 넣는다.
2. 명령이 `&&`, `;`, `|`로 이어질 때 뒤쪽의 `git commit`이나 `rm`도 잡아야 한다. ToolRisk spec에 넣는다.
3. vitest가 모듈 로드에 실패한 파일(assertion 0개)을 assertion 실패로 세면 안 된다. VitestReportDto spec에 넣는다.
4. 기준선에서 이미 실패하던 테스트 때문에 Green이 막히면 안 된다. 반대로 새로 깨진 테스트는 반드시 잡아야 한다. Verification spec에 넣는다.
5. 접수 결과가 L급이거나 수용 기준이 모자라면 팀원을 부르지 않고 멈춰야 한다. RunScope와 MinimalLoopService spec에 넣는다.

---

### Task 1: 모델 ID 5.5로 되돌리기

**Files:** Modify `packages/core/src/orchestration/domain/team.ts`, `packages/core/src/orchestration/application/work-order.service.spec.ts`, `docs/design/claude-team-design.md`(모델 표기·요금 표)

- [ ] spec의 기대값을 `claude-haiku-5-5`로 바꾸고 실패를 확인한다. 그다음 `MODEL_ID`를 5.5 계열로 바꾸고 통과를 확인한다.
- [ ] 상위 설계 문서의 Haiku 4.5 / Sonnet 5 / Opus 5 표기를 5.5 계열로 바꾼다. 요금 표도 공식 Models overview(2026-10-25) 값으로 고친다.
- [ ] `claude -p --model claude-haiku-5-5 "ok"`로 세 ID가 실제로 호출되는지 확인한다.

### Task 2: domain 값 객체 — ToolRisk, Verification, RunScope, WritePolicy 확장, Profile.runsDir

**Files:**
- Create: `packages/core/src/orchestration/domain/tool-risk.ts`, `verification.ts`, `run-scope.ts` (+ 각 `.spec.ts`)
- Modify: `write-policy.ts` (+ spec), `shared/path-pattern.ts` (`isInsideRoot`), `profile/domain/profile.ts` (`runsDir`)

**Interfaces (Produces):**
```ts
// tool-risk.ts
export type ToolDecision = 'allow' | 'ask' | 'deny';
export interface ToolVerdict { readonly decision: ToolDecision; readonly reason: string | null }
export class ToolRisk { static assess(tool: string, input: Record<string, unknown>, root: string): ToolVerdict }
// verification.ts
export type CheckName = 'locked-tests' | 'tests' | 'typecheck' | 'lint';
export type CheckStatus = 'pass' | 'fail' | 'skip';
export interface CheckResult { readonly name: CheckName; readonly status: CheckStatus; readonly failures: readonly string[]; readonly command: string | null; readonly summary: string }
export interface CheckVerdict extends CheckResult { readonly ok: boolean; readonly newFailures: readonly string[]; readonly preexisting: readonly string[] }
export class Verification {
  static of(results: readonly CheckResult[]): Verification
  get results(): readonly CheckResult[]
  judge(baseline: Verification | null): VerificationVerdict
}
export class VerificationVerdict { get checks(): readonly CheckVerdict[]; isPassing(): boolean; toTestRun(locked: TestRun): TestRun; toFailureNote(): string }
// run-scope.ts
export type StopReason = 'too-large' | 'needs-senior' | 'needs-support' | 'halted' | 'unsupported-stage';
export type ScopeDecision = { kind: 'continue'; assignment: Assignment } | { kind: 'complete' } | { kind: 'stop'; reason: StopReason };
export class RunScope { static minimalLoop(): RunScope; decide(order: WorkOrder): ScopeDecision }
// path-pattern.ts
export function isInsideRoot(root: string, path: string): boolean   // 상대 경로는 root 기준, '..' 정규화, Windows 대소문자 무시
// profile.ts
runsDir(home: string): string   // `${home}/.rauha/profiles/${name}/runs` (posix)
```

**규칙 (spec 이름 = 규칙 문장):**
- ToolRisk
  - `'git commit과 git push는 언제나 거절한다'`: `npm test && git commit -m x`도 거절이다.
  - `'git 쓰기 명령은 묻는다'`: reset, checkout, restore, switch, clean, stash, rebase, merge, cherry-pick, revert, `branch -d|-D`, tag, rm, mv, am, apply.
  - `'git 읽기 명령은 허용한다'`: status, diff, log, show.
  - `'파일 지우기는 묻는다'`: rm, rmdir, del, erase, rd, unlink, Remove-Item, `find … -delete`. `cd x; rm -rf y`처럼 이어진 명령도 묻는다.
  - `'전역 설치·배포·sudo는 묻는다'`: `npm i -g`, `npm install --global`, `yarn global`, `pnpm add -g`, `npm publish`, `yarn npm publish`, `pnpm publish`, sudo.
  - `'테스트·빌드·설치 명령은 허용한다'`: `yarn test`, `npx vitest run a.spec.ts`, `npm install`.
  - `'폴더 밖 경로에 쓰는 Edit/Write는 묻는다'`: Windows 경로 `E:\other\a.ts`와 상대 경로 `../x.ts`를 포함한다. 폴더 안 쓰기는 허용한다.
  - `'읽기 도구와 웹 도구는 허용한다'`: Read, Grep, Glob, WebSearch, WebFetch.
  - 명령 분리: `&&`, `||`, `;`, `|`, 줄바꿈으로 나눈다. 각 조각 앞의 `VAR=x` 환경 대입은 건너뛴다.
- Verification
  - `'잠긴 테스트가 통과하지 않으면 검증 실패'`: skip도 실패다.
  - `'기준선에 없던 새 실패만 실패로 친다'`: tests가 기준선 [a]이고 지금 [a,b]이면 newFailures는 [b]이고 ok는 false다. 지금 [a]이면 ok는 true이고 preexisting은 [a]다.
  - `'기준선이 없으면 모든 실패를 실패로 친다'`.
  - `'이름을 비교할 수 없는 실패는 기준선이 통과였을 때만 판정에 쓴다'`: lint가 failures []이고 기준선도 fail이면 ok다. 기준선이 pass면 실패다.
  - `'건너뛴 검사는 통과로 본다'`: locked-tests는 예외다.
  - `toTestRun`: 통과면 locked를 그대로 돌려준다. 실패면 `TestRun.of({passed: locked.passed, failed: max(locked.failed,1), failedNames: locked 실패 이름 + "<check>: <newFailure>"})`.
- RunScope.minimalLoop
  - `'L급은 팀원을 부르지 않고 멈춘다(too-large)'`: `difficulty.startsWithSenior()`일 때다.
  - `'review 단계에 닿으면 1단계 완료'`.
  - `'halted면 halted로 멈춘다'`.
  - `'red 단계 haiku 테스트 팀원과 green 단계 haiku 구현 팀원만 이어서 부른다'`.
  - `'구현이 sonnet으로 오르면 needs-senior'`, 테스트 팀원이 sonnet으로 올라도 needs-senior다.
  - `'지원 요청이 걸리면 needs-support'`.
  - 그 밖의 단계(scenario, design)는 unsupported-stage다.
- WritePolicy (확장)
  - `'테스트 팀원은 잠기기 전까지 범위 안 소스에 빈 시그니처를 만들 수 있다'`: 잠긴 뒤에는 범위 안이라도 거절한다. 범위 밖은 언제나 거절한다.
  - 구현 팀원이 테스트를 다 만들어 버리면 Red가 실패 0개로 무효가 된다. 그래서 따로 막는 규칙은 두지 않는다.

- [ ] 각 spec을 먼저 쓰고 `yarn vitest run packages/core/src/orchestration/domain` 실패를 확인한다. 구현한 뒤 통과를 확인한다.
- [ ] `index.ts`에서 새 타입을 export한다.

### Task 3: application DTO — Intake, MemberReport/Explanation, VitestReport, ReadingGuide, RoleSettings

**Files:** Create in `packages/core/src/orchestration/application/dto/`: `intake.dto.ts`, `explanation.dto.ts`, `vitest-report.dto.ts`, `reading-guide.dto.ts`, `role-settings.dto.ts` (+ spec each); `schemas.ts`

**Interfaces (Produces):**
```ts
export class IntakeDto {
  static from(input: unknown): IntakeDto     // title, fileCount, crossModule?, sensitive?, scope[1+], acceptance[{kind:'happy'|'error', text}], doneWhen, forbidden[]
  toOpenWorkOrder(): OpenWorkOrderDto
  toScenarioSummary(): ScenarioSummary
  toBrief(): string                          // 상위 설계 「업무 지시서 양식」 + 수용 기준 목록
}
export class ExplanationDto {
  static from(input: unknown): ExplanationDto   // decisions 1–4 {what, why, rejected?}, readingOrder 1–4 {path, line?, note}, manualChecks 1–3, untested 0–3
  isWithinBudget(limit = EXPLANATION_TOKEN_BUDGET /*400*/): boolean
}
export class MemberReportDto { static from(input: unknown, withExplanation: boolean): MemberReportDto; readonly report: WorkReportDto; readonly explanation: ExplanationDto | null }
export class VitestReportDto {
  static from(input: unknown): VitestReportDto  // vitest --reporter=json 출력
  toTestRun(): TestRun
  failureIds(): string[]                        // assertion fullName, 로드 실패 파일은 파일 경로
  failureDigest(maxLines = 12): string          // 다음 팀원에게 넘길 실패 요약
}
export class ReadingGuideDto {
  static create(props: ReadingGuideProps): ReadingGuideDto
  toMarkdown(): string
  toTerminal(root: string): string             // path:line 를 OSC 8 하이퍼링크(file:///…)로 감싼다
}
export class RoleSettingsDto { static defaults(): RoleSettingsDto; withEnv(env: Record<string,string|undefined>): RoleSettingsDto; get(role: MemberRole): RoleSetting }
export type MemberRole = 'intake' | 'tester' | 'implementer';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export interface RoleSetting { readonly tier: ModelTier; readonly effort: Effort; readonly maxTurns: number; readonly maxBudgetUsd: number; readonly tools: readonly string[] }
// schemas.ts
export const INTAKE_SCHEMA, TESTER_REPORT_SCHEMA, IMPLEMENTER_REPORT_SCHEMA: Record<string, unknown>
```

**값:**
- 기본 RoleSetting
  - intake: sonnet / low / 15턴 / $0.50 / [Read, Grep, Glob, WebSearch, WebFetch]
  - tester: haiku / medium / 30턴 / $0.50 / intake 도구 + [Edit, Write, Bash]
  - implementer: haiku / medium / 40턴 / $1.00 / tester와 같은 도구
- 환경 변수 덮어쓰기: `RAUHA_ROLE_<ROLE>=<tier>[:<effort>]`. 예: `RAUHA_ROLE_IMPLEMENTER=sonnet:high`. 형식이 틀리면 `INVALID_INPUT`.
- VitestReport의 실패 종류 분류
  - 파일 수준 실패이면서 assertion이 0개인 경우
    - 메시지가 `/Cannot find module|Failed to load|Failed to resolve import|does not provide an export/`이면 `import`
    - 그 밖에는 `compile`
  - assertion 실패 메시지가 `/timed out/i`이면 `timeout`
  - 그 밖에는 `assertion`. 실행 중 `TypeError`(예: not implemented 스텁)도 assertion이다.
- 기존 `WorkReportDto`는 그대로 쓴다.

**spec 이름:**
- `'수용 기준의 정상·예외 경로 수로 시나리오 요약을 만든다'`
- `'범위가 비면 접수를 거부한다'`
- `'설명은 결정 1–4개, 읽는 순서 1–4개여야 한다'`
- `'설명이 400토큰을 넘으면 예산 초과'`
- `'모듈 로드 실패는 assertion 실패가 아니다'`
- `'실행 중 TypeError는 올바른 Red로 본다'`
- `'환경 변수로 역할의 모델과 effort를 바꾼다'`
- `'안내서는 읽는 순서·결정·직접 해 볼 것·검증 결과를 담는다'`
- `'멈췄을 때 안내서는 이유와 되돌리는 방법을 담는다'`: 새 파일은 `git clean -f -- <파일>`, 수정 파일은 `git checkout -- <파일>`.

- [ ] spec을 쓰고 실패를 확인한다 → 구현 → 통과를 확인한다.

### Task 4: application 포트와 MinimalLoopService

**Files:** Create `packages/core/src/orchestration/application/ports.ts`, `minimal-loop.service.ts`, `minimal-loop.service.spec.ts` (가짜 포트 사용)

**Interfaces:**
```ts
// ports.ts
export interface MemberCall { readonly role: MemberRole; readonly setting: RoleSetting; readonly userMessage: string; readonly outputSchema: Record<string, unknown>; readonly canWrite: (relPath: string) => boolean }
export interface MemberUsage { readonly model: string; readonly durationMs: number; readonly costUsd: number; readonly turns: number; readonly inputTokens: number; readonly outputTokens: number; readonly cacheReadTokens: number; readonly denials: readonly string[]; readonly endReason: string }
export interface MemberResult { readonly output: unknown | null; readonly error: string | null; readonly usage: MemberUsage }
export interface TeamMemberPort { run(call: MemberCall): Promise<MemberResult> }
export interface FileChange { readonly path: string; readonly kind: 'added' | 'modified' | 'deleted' }
export interface WorkspaceSnapshot { readonly files: ReadonlyMap<string, string> }   // path → content hash (HEAD 대비 바뀐 파일)
export interface WorkspacePort { dirtyFiles(): Promise<string[] | null /* null = git 저장소 아님 */>; snapshot(): Promise<WorkspaceSnapshot>; changesBetween(a: WorkspaceSnapshot, b: WorkspaceSnapshot): FileChange[]; changesSinceHead(): Promise<FileChange[]> }
export interface ChecksPort { runTests(files: readonly string[]): Promise<{ run: TestRun; ids: string[]; digest: string; command: string }>; runSuite(): Promise<CheckResult[]> }
export interface RunLogPort { recordCall(role: MemberRole, attempt: number, call: MemberCall, result: MemberResult): Promise<void>; recordChecks(label: string, results: readonly CheckResult[]): Promise<void>; finish(summary: Record<string, unknown>, guideMarkdown: string): Promise<string /* 기록 폴더 */> }
export interface ProgressPort { step(message: string): void }
// minimal-loop.service.ts
export interface RunOutcome { readonly guide: ReadingGuideDto; readonly status: 'complete' | 'stopped'; readonly stopReason: StopReason | 'intake-failed' | null; readonly calls: number; readonly implementerAttempts: number; readonly costUsd: number; readonly durationMs: number; readonly usage: Readonly<Record<ModelTier, { calls: number; tokens: number }>>; readonly logDir: string }
export class MinimalLoopService {
  constructor(deps: { team: TeamMemberPort; workspace: WorkspacePort; checks: ChecksPort; log: RunLogPort; progress: ProgressPort; roles: RoleSettingsDto; newId: () => string; now: () => number; badge: string; requireClean: boolean })
  run(request: string): Promise<RunOutcome>
}
```

**흐름:**
1. 작업 공간 확인
   - `requireClean`이면 `dirtyFiles()`를 본다. null이면 `DomainError('NOT_A_REPO')`, 비어 있지 않으면 `DomainError('DIRTY_WORKTREE', 파일 목록 포함)`.
   - 이 판정은 domain에 `WorkspaceState.of(dirty).assertReady(requireClean)`로 둔다. spec도 쓴다.
2. 기준선 `runSuite()`와 접수 호출을 `Promise.all`로 동시에 돌린다.
3. 접수
   - `IntakeDto.from` → `toOpenWorkOrder().toEntity(id)` → `approveScenario(...)` 순서로 한다.
   - DomainError가 나면 오류 문장을 붙여 접수를 1회 다시 한다. 또 실패하면 `intake-failed`로 멈춘다.
4. 반복: `RunScope.minimalLoop().decide(order)`
   - **tester**
     1. `snapshot` → 호출 → `snapshot`으로 바뀐 파일을 구한다.
     2. `assertDiffAllowed('tester', paths)`가 거부되면 `recordRed(TestRun.of({passed:0, failed:0}))`로 무효 처리한다.
     3. 바뀐 테스트 파일이 없으면 같은 방식으로 무효 처리한다.
     4. 그 밖에는 `runTests(testFiles)` 결과를 `recordRed`에 넘긴다. 무효 Red의 digest는 다음 메시지에 붙인다.
   - **implementer**
     1. `snapshot` → 호출 → `snapshot`으로 바뀐 파일을 구한다.
     2. `assertDiffAllowed('implementer')`가 거부되면 실패 노트를 남기고 `recordGreen(TestRun.of({passed:0, failed:1}), note)`.
     3. 그 밖에는 `runTests(locked)`와 `runSuite()`를 돌린다. `Verification.of([locked-tests, ...suite]).judge(baseline)` 결과를 `recordGreen(verdict.toTestRun(run), verdict.toFailureNote())`에 넘긴다.
     4. 재시도 메시지에는 `order.handoffNote()`를 붙인다.
   - **complete / stop**: 반복을 끝낸다.
5. 안내서와 기록
   - `ReadingGuideDto`는 마지막 구현 보고의 설명, 판정 결과, `changesSinceHead()`로 조립한다.
   - `log.finish`가 돌려준 폴더를 `RunOutcome.logDir`에 넣는다.

**팀원 메시지:**
- tester: `toBrief()` + `<task>실패하는 테스트 작성</task>` + (재시도면) `<previous_attempt>digest</previous_attempt>`
- implementer: `toBrief()` + 잠긴 테스트 경로 + (재시도면) `<handoff>handoffNote</handoff>`

**spec (가짜 포트):**
- `'커밋하지 않은 변경이 있으면 시작하지 않는다'`
- `'L급 접수는 팀원을 부르지 않고 멈춘다'`
- `'Red가 유효하면 구현 팀원을 부르고 검증이 통과하면 완료'`
- `'잠긴 테스트를 바꾼 구현은 실패로 친다'`
- `'구현이 두 번 실패하면 needs-senior로 멈춘다'`
- `'기준선에서 이미 깨진 테스트는 Green을 막지 않는다'`

- [ ] spec을 쓰고 실패를 확인한다 → 구현 → 통과를 확인한다.

### Task 5: 팀원 프롬프트

**Files:** Create `prompts/_common.md`, `prompts/intake.md`, `prompts/tester.md`, `prompts/implementer.md`

- 스펙 5.2절과 5.3절을 따르고, XML 칸으로 나눈다: `<role>`, `<steps>`, `<rules>`, `<report>`.
- Haiku 5.5·Sonnet 5.5 문서의 "끝까지 하고 시킨 것만" 문단과 "실제 검증" 문단을 넣는다.
- implementer
  - 순서: 구조 파악(병렬 읽기, `CLAUDE.md`) → 배치 결정 → 최소 구현 → 검증 → 보고.
  - 보고의 설명은 "결정 요약"이라고 부른다. "추론 과정"이라고 쓰지 않는다.
- tester
  - 스텁 규칙: 테스트가 import할 대상이 없으면, 범위 안에 시그니처만 있고 `throw new Error('not implemented')`하는 스텁을 만든다.
  - 기존 테스트의 스타일을 따른다.
- intake: 코드를 쓰지 않는다. 범위는 좁게 잡는다. 수용 기준은 테스트로 옮길 수 있는 문장으로 쓴다.
- 대상 프로젝트의 스타일을 따르라고만 한다. rauha 자체의 DDD 규칙은 넣지 않는다.

### Task 6: infrastructure 어댑터

**Files:** Create in `packages/core/src/orchestration/infrastructure/`:
- `prompt-library.ts`: `PromptLibrary.load(dir): Promise<PromptLibrary>`, `system(role): string`, `hash: string`(sha256 앞 8자리)
- `tool-guard.ts`: `createToolGuard({ root, canWrite, ask }): HookCallback`
  - 경로 판정: Edit/Write/NotebookEdit의 `file_path`를 root 기준 상대 경로로 바꾼다. 폴더 안인데 `canWrite`가 거부하면 deny다(묻지 않는다).
  - 위험 판정: `ToolRisk.assess`가 ask면 `await ask(text)`의 true/false에 따라 allow/deny, deny면 deny다.
  - 결과는 `permissionDecision` 형태로 돌려준다.
- `agent-sdk-team-member.ts`: `AgentSdkTeamMember implements TeamMemberPort`. 생성자 인자는 `{ cwd, env, prompts, ask }`다. `query()` 옵션:
  - `model: MODEL_ID[tier]`, `cwd`, `env`, `systemPrompt`(문자열), `tools`, `allowedTools`
  - `permissionMode: 'dontAsk'`, `settingSources: ['project']`, `effort`, `maxTurns`, `maxBudgetUsd`
  - `outputFormat: { type: 'json_schema', schema }`, `hooks: { PreToolUse: [{ hooks: [guard] }] }`
  - 결과는 result 메시지에서 읽는다: `structured_output`, `modelUsage` 합계, `total_cost_usd`, `duration_ms`, `num_turns`, `permission_denials`, `subtype`
- `git-workspace.ts`: `GitWorkspace implements WorkspacePort`
  - `git status --porcelain=v1 -z -uall`로 바뀐 파일을 구하고, `git hash-object`로 내용 해시를 만든다.
- `node-checks.ts`: `NodeChecks implements ChecksPort`
  - 패키지 매니저는 lockfile로 고른다(yarn / pnpm / npm, 없으면 npm). `package.json`의 scripts에서 test, typecheck, lint를 찾는다.
  - typecheck 스크립트가 없고 `tsconfig.json`이 있으면 `tsc --noEmit`을 쓴다.
  - vitest는 `<pm exec> vitest run <files> --reporter=json --outputFile=<tmp>`로 돌린다.
  - Windows에서는 `shell: true`로 실행하고, 명령마다 시간 제한(기본 5분)을 둔다.
- `file-run-log.ts`: `FileRunLog implements RunLogPort`. 기록 위치는 `runsDir/<yyyyMMdd-HHmmss>-<id8>/`, 파일은 `calls/NN-role-attemptN.json`, `checks-<label>.json`, `summary.json`, `guide.md`.
- `packages/core/src/profile/infrastructure/config-file.ts`: `loadProfileConfig(path): Promise<ProfileConfigDto>`. 파일이 없으면 defaults를 쓰고, smol-toml로 파싱한다.

- [ ] 의존성을 추가한다: core에 `@anthropic-ai/claude-agent-sdk@0.3.296`, `smol-toml@1.9.1`. 실행: `yarn workspace @rauha/core add …`.
- [ ] spec을 쓴다. 각 spec은 임시 git 폴더를 만들어 실제로 실행한다.
  - `tool-guard.spec.ts`: `'잠긴 테스트 쓰기는 묻지 않고 거절한다'`, `'위험 명령은 물어보고 답에 따른다'`
  - `git-workspace.spec.ts`: `'두 스냅숏 사이에 바뀐 파일만 돌려준다'`
  - `node-checks.spec.ts`: `'lockfile로 패키지 매니저를 고른다'`
  - `config-file.spec.ts`: `'설정 파일이 없으면 기본 프로필을 쓴다'`
- [ ] SDK 어댑터는 단위 테스트하지 않는다. Task 8의 실제 실행으로 확인한다.

### Task 7: CLI — `-p`, `login`, `bench`, 확인 프롬프트

**Files:** Modify `packages/cli/src/args.ts`(+spec), `main.ts`; Create `packages/cli/src/run.ts`, `bench.ts`, `ask.ts`; root `package.json` script `"bench": "yarn rauha bench"`

**인자:**
- `login [--profile x]`
- `bench [--only <id>]`
- `-p <요청>`
- `chat` 모드(`-p` 없음)는 지금처럼 "구현 전" 안내만 한다.

**작업 폴더와 설정:**
- 작업 폴더는 `process.env.INIT_CWD ?? process.cwd()`다. `yarn rauha`가 패키지 폴더에서 실행되기 때문이다.
- 설정 파일 경로는 `RAUHA_CONFIG` 환경 변수가 있으면 그것을, 없으면 `~/.rauha/config.toml`을 쓴다.

**ask.ts:**
- stdin과 stdout이 TTY면 readline으로 `위험 동작 허락? <내용> [y/N]`을 묻는다.
- TTY가 아니면 항상 false를 돌려준다.
- 동시에 여러 개가 와도 한 번에 하나씩 묻는다(직렬화).

**login:**
- `spawn('claude', ['auth', 'login'], { env: {...process.env, CLAUDE_CONFIG_DIR}, stdio: 'inherit', shell: win32 })`
- 설정 폴더는 미리 `mkdir -p`로 만든다.

**bench:**
1. `examples/bench/requests.json`을 읽는다: `[{id, request}]`.
2. 요청마다 `examples/sandbox`를 `<root>/.rauha/bench/<stamp>/<id>`로 복사한다. 그 안에서 `git init`과 첫 커밋을 하고(이 작성자 정보는 `-c user.name=rauha-bench`), `requireClean: true`로 실행한다. ask는 항상 false다.
3. 결과 표를 출력하고 `<root>/.rauha/bench/<stamp>/bench.md`로 저장한다.
   - 열: 요청, 결과, 시도, 시간, haiku 토큰, sonnet 토큰, 추정 비용
   - 아래 줄: 첫 시도 성공 n/m, 평균 시간, 합계, 프롬프트 해시

**출력:**
- 진행 상황은 `ProgressPort`로 `[personal] 테스트 팀원(haiku) 작업 중…`처럼 stderr에 한 줄씩 쓴다.
- 안내서는 stdout에 `toTerminal(root)`로 쓴다.

- [ ] args spec(login, bench, --only)을 먼저 쓴다 → 구현 → typecheck/test를 통과시킨다.

### Task 8: 연습용 프로젝트, bench 요청, 실제 실행 검증

**Files:** Create `examples/sandbox/`, `examples/bench/requests.json`

**examples/sandbox/**
- 파일
  - `package.json`: `type: module`, scripts `test: vitest run`, `typecheck: tsc --noEmit`. 의존성은 rauha 루트 node_modules에서 위로 찾아 쓴다.
  - `tsconfig.json`, `vitest.config.ts`
  - `CLAUDE.md`: 계층(domain / application / shared)과 "shared 유틸을 재사용하라"는 규칙
  - `src/shared/errors.ts`: `AppError`
  - `src/shared/format.ts`: `formatWon`
  - `src/domain/money.ts`: `Money` 값 객체
  - `src/domain/cart.ts`: `Cart` 엔티티
  - `src/application/cart.service.ts`: `CartService`
  - 위 각각의 `.spec.ts`
- 원본 상태에서 `npm run test`와 `npm run typecheck`가 통과해야 한다.

**examples/bench/requests.json** (5개)
- reverse 유틸 추가
- Money.discount(퍼센트, 0~100 밖이면 `AppError`)
- Cart.removeItem(없는 상품이면 `AppError`)
- CartService.summary(`formatWon` 재사용)
- Money.isGreaterThan

**검증**
- [ ] `yarn typecheck && yarn test`가 모두 통과한다.
- [ ] `yarn build`가 통과한다.
- [ ] 실제 실행: `RAUHA_CONFIG=<scratch config>`로 실행한다. 이 설정의 personal 프로필은 claude_config_dir를 사용자의 기존 `~/.claude` 로그인으로 가리킨다(토큰은 읽거나 옮기지 않고, 위치만 지정).
  - `yarn bench --only discount`로 한 건을 끝까지 돌린다.
  - 확인할 것: 안내서 출력, 기록 폴더 내용, 판정, 비용·시간.
- [ ] 문제가 보이면 프롬프트나 코드를 고친 뒤 다시 실행한다. 마지막으로 bench 전체를 한 번 돌려 표를 확보한다.
- [ ] 상위 설계 체크리스트에 "작업별 모델·토큰 사용량 기록 방식 결정"을 체크한다.
