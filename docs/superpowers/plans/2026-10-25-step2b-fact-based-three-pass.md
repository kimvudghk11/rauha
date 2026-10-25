# 2단계 B: 사실 기반 3단 작업 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 요청이 기본값으로 1차 구현 → 리뷰어 재검증·2차 구현 → 사실 점검을 거치고, 결정·외부 사실·리뷰 지적의 근거를 rauha 코드가 확인해서 확인 안 된 것은 "추측"으로 드러낸다.

**Architecture:** 근거 확인 규칙은 도메인 값 객체(`FactCheck`, `ReviewFindings`)가 순수 데이터로 판정한다. 파일 내용·통과한 테스트 이름·팀원이 실제로 연 URL은 인프라가 모아서 넘긴다. 상태 머신의 review 단계(이미 있음)를 리뷰어 팀원이 맡고, 사실 점검과 사용자 확인도 review 단계 안에서 끝낸 뒤 `recordReview`로 판정을 넘긴다.

**Tech Stack:** TypeScript, vitest, `@anthropic-ai/claude-agent-sdk` (PostToolUse 훅), Yarn 4

**Spec:** `docs/superpowers/specs/2026-10-25-step2-ladder-facts-chat-design.md` 4장, 6장

## Global Constraints

- 패키지 관리는 yarn만. 끝내기 전에 `yarn typecheck`와 `yarn test` 통과.
- domain은 Node·SDK·파일을 import하지 않는다. 판정 규칙은 엔티티·값 객체 메서드, 입력 검증은 DTO, 서비스는 불러오기→호출→저장만(도메인 `if` 금지).
- 규칙 변경은 실패하는 `*.spec.ts`부터. 테스트 이름은 한국어 규칙 문장.
- 모델이 "확인했다"고 말한 것을 믿지 않는다. 근거는 코드가 확인한다.
- 근거 없는 리뷰 지적은 2차 구현을 일으키지 않는다(안내서에 "리뷰어 추측"으로만).
- 코드에 들어간 추측(facts)만 사용자에게 묻고, 결정 이유의 추측은 표시만 한다. 화면이 없으면 묻지 않고 "확인 필요"로 남긴다.
- 3단은 기본값. `--quick`이면 1단계처럼 검증 통과 시 완료(리뷰·사실 점검 없음).
- 리뷰어 모델은 sonnet. 리뷰어는 파일을 쓰지 않는다(읽기 도구만).
- 작업마다 커밋하고 `main`에 push. 메시지 끝 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- 인용 조각이 아주 짧은 code 근거(예: `a`, `}`)는 아무 파일에서나 찾아지므로 근거로 인정하면 안 된다 → Task 1 테스트(공백 뺀 8자 미만 인용은 실패).
- 작업 폴더 밖 경로나 `../` 경로를 code 근거로 대면 파일을 읽지 않고 실패로 본다 → Task 2 테스트(GitWorkspace.readFile이 밖 경로에 null).
- URL 표기 차이(끝 `/`, `#frag`)만 다른 web 근거는 같은 주소로 본다 → Task 1 테스트.
- 리뷰어가 근거 있는 지적과 없는 지적을 섞어 내면 근거 있는 것만 2차 구현에 넘어간다 → Task 5 테스트.
- 화면 없는 실행(bench)에서 추측 확인을 기다리며 멈추지 않는다 → Task 5 테스트(noUser면 confirmFact를 부르지 않음).

---

### Task 1: 근거 판정 도메인 — Evidence, FactCheck, ReviewFindings

**Files:**
- Create: `packages/core/src/orchestration/domain/fact-check.ts`
- Test: `packages/core/src/orchestration/domain/fact-check.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Evidence =
    | { kind: 'code'; path: string; line: number | null; quote: string }
    | { kind: 'test'; name: string }
    | { kind: 'web'; url: string; quote: string | null }
    | { kind: 'user'; text: string };
  export type ClaimKind = 'decision' | 'fact' | 'review';
  export interface Claim { readonly kind: ClaimKind; readonly text: string; readonly evidence: readonly Evidence[] }
  export interface EvidenceSources {
    readonly files: ReadonlyMap<string, string | null>;      // 근거에 나온 경로 → 내용(없거나 밖이면 null)
    readonly passedTests: readonly string[];                  // 이번 실행 검증 묶음에서 통과한 테스트 전체 이름
    readonly fetched: ReadonlyMap<string, string | null>;     // 정규화 URL → 가져온 본문(못 남겼으면 null)
    readonly userStatements: readonly string[];               // 확정된 가정·사용자 정정
  }
  export interface CheckedClaim extends Claim { readonly verified: readonly Evidence[]; readonly isGuess: boolean }
  export class FactCheck {
    static of(claims: readonly Claim[], sources: EvidenceSources): FactCheck;
    all(): readonly CheckedClaim[];
    guesses(kind?: ClaimKind): readonly CheckedClaim[];
  }
  export function normalizeUrl(url: string): string;  // 끝 '/'·'#…' 제거, 소문자 호스트
  export function citedPaths(claims: readonly Claim[]): string[];  // code 근거 경로(중복 제거)
  export class ReviewFindings {
    static of(reviewIssues: FactCheck, corrections: readonly string[]): ReviewFindings;
    verdict(): 'pass' | 'changes';           // 확인된 지적이나 정정이 하나라도 있으면 changes
    feedback(): string;                      // 2차 구현에 넘길 블록 본문(확인된 지적 + 정정만)
  }
  ```

- [ ] **Step 1: 실패하는 테스트**
  - `'인용한 코드가 그 파일에 있으면 code 근거로 인정한다'` (줄 번호가 달라도 파일 안에 있으면 인정)
  - `'공백을 뺀 8자 미만의 인용은 근거로 인정하지 않는다'`
  - `'없는 파일이나 읽지 못한 파일을 가리키는 code 근거는 인정하지 않는다'` (files 값 null)
  - `'이번 실행에서 통과한 테스트만 test 근거로 인정한다'` (passedTests의 전체 이름이 인용 이름을 포함하면 인정, 실패·없는 이름은 불인정)
  - `'실제로 연 주소만 web 근거로 인정하고, 끝 슬래시와 #은 같은 주소로 본다'`
  - `'가져온 본문이 있으면 인용 문장이 본문에 있어야 web 근거로 인정한다'` (본문 null이면 열었다는 것만으로 인정)
  - `'확정된 가정이나 사용자 정정에 있는 내용만 user 근거로 인정한다'`
  - `'확인된 근거가 하나도 없는 주장은 추측이다'` + `guesses('fact')` 필터
  - ReviewFindings: `'확인된 리뷰 지적이 있으면 수정 요청이고, 추측인 지적만 있으면 통과다'`, `'사용자 정정이 있으면 수정 요청이고 정정 내용이 피드백에 들어간다'`
- [ ] **Step 2:** `yarn vitest run packages/core/src/orchestration/domain/fact-check.spec.ts` → 모듈 없음으로 FAIL
- [ ] **Step 3:** 구현. 비교는 공백 정규화(연속 공백 → 한 칸, 앞뒤 제거) 후 포함 여부. `MIN_QUOTE = 8`(공백 제외 글자 수).
- [ ] **Step 4:** 같은 명령 → PASS
- [ ] **Step 5:** 커밋 `feat(core): 근거 판정 — 코드가 확인한 것만 사실로`

### Task 2: 근거 재료 모으기 — 파일 읽기, 통과한 테스트, 연 URL

**Files:**
- Modify: `packages/core/src/orchestration/application/ports.ts`, `packages/core/src/orchestration/infrastructure/git-workspace.ts`, `packages/core/src/orchestration/infrastructure/node-checks.ts`, `packages/core/src/orchestration/application/dto/vitest-report.dto.ts`, `packages/core/src/orchestration/infrastructure/agent-sdk-team-member.ts`
- Test: `git-workspace.spec.ts`, `vitest-report.dto.spec.ts`, 새 `packages/core/src/orchestration/infrastructure/fetch-log.spec.ts`
- Create: `packages/core/src/orchestration/infrastructure/fetch-log.ts`

**Interfaces:**
- Produces: `WorkspacePort.readFile(path: string): Promise<string | null>` (작업 폴더 밖·없는 파일 null). `TestsResult.passed: readonly string[]`, `VitestReportDto.passedNames(): string[]`. `MemberResult.fetched: readonly { url: string; body: string | null }[]`. `createFetchLog(): { hook: HookCallback; entries(): { url: string; body: string | null }[] }` — PostToolUse에서 `tool_name === 'WebFetch'`일 때 `tool_input.url`과 `tool_response`(문자열이면 그대로, 객체면 `result`/`content` 문자열 필드, 없으면 null; 본문은 앞 20,000자만)를 남긴다.
- 서비스는 `suiteTests`의 통과 이름도 필요하므로 `ChecksPort.runSuite()`가 돌려주는 `CheckResult` 중 tests 결과에 통과 이름을 실을 수 없다면, Task 5에서 잠긴 테스트 실행(`runTests`)의 `passed`만 test 근거 재료로 쓴다(전체 테스트 이름까지는 넓히지 않음 — Ruling 후보).

- [ ] **Step 1: 실패하는 테스트**
  - git-workspace: `'작업 폴더 안의 파일만 읽고, 밖이거나 없는 파일은 null'` (`../x`, 절대 경로 밖, 없는 파일)
  - vitest-report: `'통과한 테스트의 전체 이름을 돌려준다'`
  - fetch-log: `'WebFetch로 연 주소와 본문을 남기고 다른 도구는 무시한다'`, `'본문은 앞 20,000자만 남긴다'`
- [ ] **Step 2:** 해당 spec 실행 → FAIL
- [ ] **Step 3:** 구현. `AgentSdkTeamMember.run`이 호출마다 `createFetchLog()`를 만들어 `hooks.PostToolUse`에 넣고 결과에 `fetched`를 싣는다. FakeTeam 등 테스트 더블은 `fetched: []`.
- [ ] **Step 4:** `yarn typecheck && yarn vitest run packages/core` → PASS
- [ ] **Step 5:** 커밋 `feat(core): 근거 재료 — 파일 읽기, 통과한 테스트, 실제로 연 URL`

### Task 3: 보고 양식에 근거 — 구현 보고 evidence·facts, 리뷰 보고

**Files:**
- Modify: `packages/core/src/orchestration/application/dto/schemas.ts`, `packages/core/src/orchestration/application/dto/explanation.dto.ts`
- Create: `packages/core/src/orchestration/application/dto/evidence.dto.ts`, `packages/core/src/orchestration/application/dto/review-report.dto.ts`
- Test: `explanation.dto.spec.ts`, 새 `evidence.dto.spec.ts`, `review-report.dto.spec.ts`

**Interfaces:**
- Consumes: Task 1 `Evidence`, `Claim`.
- Produces:
  - JSON 스키마의 근거 항목(구조화 출력은 oneOf를 피하고 한 모양): `{ kind: 'code'|'test'|'web'|'user', path: string|null, line: integer|null, quote: string|null, name: string|null, url: string|null, text: string|null }`.
  - `EvidenceDto.list(raw: unknown, what: string): Evidence[]` — 종류별 필수 칸이 빈 항목은 버린다(예외 아님: 근거가 모자라면 추측이 될 뿐).
  - `IMPLEMENTER_REPORT_SCHEMA.explanation.decisions[]`에 `evidence`(0–4개) 추가, `explanation.facts`(0–6개, `{ claim: string, evidence: [...] }`) 추가. `ExplanationDto.decisions[].evidence`, `ExplanationDto.facts: { claim: string; evidence: Evidence[] }[]`, `ExplanationDto.claims(): Claim[]`(decision → `${what} — ${why}`, fact → claim).
  - `REVIEWER_REPORT_SCHEMA = { verdict: 'pass'|'changes', summary: string, issues: [{ problem: string, path: string|null, line: integer|null, evidence: [...] }] (0–6) }`. `ReviewReportDto.from(input)`, `.claims(): Claim[]`(kind 'review').
- [ ] **Step 1: 실패하는 테스트** — `'종류별 필수 칸이 빈 근거는 버린다'`, `'결정과 외부 사실을 근거와 함께 주장 목록으로 바꾼다'`, `'리뷰 지적을 근거와 함께 주장 목록으로 바꾼다'`, `'facts가 6개를 넘으면 거부한다'`
- [ ] **Step 2:** → FAIL
- [ ] **Step 3:** 구현. 기존 `ExplanationDto` 사용처(안내서)는 그대로 컴파일되게 필드만 늘린다.
- [ ] **Step 4:** `yarn typecheck && yarn vitest run packages/core` → PASS
- [ ] **Step 5:** 커밋 `feat(core): 보고 양식에 근거 — 결정·외부 사실·리뷰 지적`

### Task 4: 리뷰어 팀원과 3단 범위

**Files:**
- Modify: `packages/core/src/orchestration/domain/run-scope.ts`, `packages/core/src/orchestration/application/dto/role-settings.dto.ts`, `packages/core/src/orchestration/infrastructure/prompt-library.ts`, `prompts/_common.md`, `prompts/implementer.md`
- Create: `prompts/reviewer.md`
- Test: `run-scope.spec.ts`, `role-settings.dto.spec.ts`, `prompt-library.spec.ts`

**Interfaces:**
- Produces: `RunScope.threePass(): RunScope` — red→tester, green→implementer, review→reviewer; 모델 haiku·sonnet; `docs` 단계 도달 시 complete; review-loop로 halted면 `stop: halted`. `MemberRole`에 `'reviewer'` 추가. 리뷰어 기본 설정 `{ tier: 'sonnet', effort: 'medium', maxTurns: 25, maxBudgetUsd: 1, tools: ['Read','Grep','Glob','WebSearch','WebFetch'] }`. PromptLibrary ROLES에 reviewer.
- [ ] **Step 1: 실패하는 테스트** — run-scope: `'3단 범위는 검증을 통과하면 리뷰어(sonnet)를 부른다'`, `'리뷰가 통과하면 완료'`, `'리뷰 수정 요청이 두 번이면 멈춘다(halted)'`. role-settings: `'리뷰어는 sonnet이고 파일을 쓰는 도구가 없다'`. prompt-library: `'리뷰어 프롬프트도 공통 원칙과 합쳐 읽는다'`.
- [ ] **Step 2:** → FAIL
- [ ] **Step 3:** 구현 + 프롬프트:
  - `_common.md`에 근거 규칙: 확인하지 않은 것은 추측이라고 쓴다. "찾아보겠다"고 했으면 WebFetch로 실제로 연다. 결정과 코드에 넣은 외부 사실(API 경로, 요청·응답 필드, 설정 키, 라이브러리 동작)마다 근거를 단다: code(경로·줄·실제 코드 한 줄 그대로 인용), test(테스트 이름), web(연 주소, 인용 문장), user(사용자가 정한 해석). 근거가 없으면 비워 두고 진행한다 — rauha가 추측으로 표시한다.
  - `implementer.md` report 절: decisions에 evidence, facts 칸 설명.
  - `reviewer.md`(새): 처음 보는 눈으로 diff(바뀐 파일을 직접 읽음)·잠긴 테스트·구현 보고의 근거를 검토한다. 수용 기준, 기존 구조(같은 일을 하는 코드가 이미 있는지), 근거와 어긋나는 것만 지적하고 취향·스타일은 지적하지 않는다. 지적마다 근거를 단다. 근거를 못 대는 의심은 issues에 넣되 근거를 비운다. 문제가 없으면 verdict pass, issues 빈 배열.
- [ ] **Step 4:** `yarn vitest run packages/core` → PASS
- [ ] **Step 5:** 커밋 `feat: 리뷰어 팀원과 3단 범위, 근거 규칙 프롬프트`

### Task 5: 서비스 — 재검증·2차 구현·사실 점검·추측 확인

**Files:**
- Modify: `packages/core/src/orchestration/application/minimal-loop.service.ts`, `packages/core/src/orchestration/application/ports.ts`
- Test: `minimal-loop.service.spec.ts`

**Interfaces:**
- Consumes: Task 1–4 전부.
- Produces:
  - `MinimalLoopDeps.threePass: boolean` (false면 `RunScope.ladder()`, true면 `RunScope.threePass()`).
  - `UserPort.confirmFact(claim: CheckedClaim): Promise<{ correct: true } | { correct: false; correction: string }>` (interactive일 때만 부름).
  - `RunOutcome.facts: { checked: readonly CheckedClaim[]; reviewerGuesses: readonly CheckedClaim[]; unconfirmed: readonly CheckedClaim[]; reviewRounds: number }`.
- review 단계 한 번의 흐름(서비스는 순서만, 판정은 도메인):
  1. 리뷰어 호출: 메시지 = brief + `<locked_tests>` + `<changed_files>`(HEAD 대비) + `<implementer_report>`(decisions·facts와 근거 JSON).
  2. 재료 모으기: 구현·리뷰 주장의 code 경로를 `workspace.readFile`로, `passed`(마지막 잠긴 테스트 실행), `fetched`(이번 업무의 모든 팀원 호출 누적), userStatements(확정 가정 chosen + 이번 실행 정정).
  3. `FactCheck.of(implementerClaims)`, `FactCheck.of(reviewClaims)`.
  4. 코드에 들어간 추측(`guesses('fact')`)은 interactive면 하나씩 `confirmFact`; 틀림이면 정정을 corrections에 모은다. 아니면 unconfirmed로 남긴다.
  5. `ReviewFindings.of(reviewCheck, corrections)` → `order.recordReview(verdict)`. changes면 다음 구현 메시지에 `<review>\n${findings.feedback()}\n</review>`.
- [ ] **Step 1: 실패하는 테스트**
  - `'검증을 통과하면 리뷰어가 보고, 문제없으면 완료한다'` (호출 순서 intake, tester, implementer, reviewer; `reviewRounds === 1`)
  - `'근거가 확인된 리뷰 지적이 있으면 2차 구현을 하고, 다시 리뷰를 받는다'` (구현 메시지에 `<review>`와 지적 문장)
  - `'근거 없는 리뷰 지적은 2차 구현을 일으키지 않고 리뷰어 추측으로 남는다'`
  - `'근거 있는 지적과 없는 지적이 섞이면 근거 있는 것만 넘긴다'`
  - `'코드에 들어간 추측은 사용자에게 묻고, 틀렸다고 하면 정정을 넣어 2차 구현한다'` (FakeUser.confirmFact → wrong, `<review>`에 정정 문장)
  - `'화면이 없으면 추측을 묻지 않고 확인 필요로 남긴다'` (`facts.unconfirmed` 길이 1, confirmFact 호출 0)
  - `'--quick이면 리뷰 없이 검증 통과로 완료한다'` (`threePass: false` → reviewer 호출 없음)
- [ ] **Step 2:** → FAIL
- [ ] **Step 3:** 구현. 리뷰어 출력이 스키마에 안 맞으면 리뷰 지적 없음 + 안내서 기록(`reviewer 보고를 읽지 못함`)으로 pass 처리하지 말고 `recordReview('changes')` 없이 한 번 다시 부른다; 두 번 실패하면 pass로 넘기되 안내서에 "리뷰를 받지 못함"을 남긴다(Ruling 후보).
- [ ] **Step 4:** `yarn typecheck && yarn vitest run packages/core` → PASS
- [ ] **Step 5:** 커밋 `feat(core): 3단 작업 — 리뷰어 재검증, 2차 구현, 사실 점검`

### Task 6: 안내서·CLI — 추측 표시와 확인 화면, --quick

**Files:**
- Modify: `packages/core/src/orchestration/application/dto/reading-guide.dto.ts`, `packages/cli/src/ask.ts`, `packages/cli/src/mascot.ts`, `packages/cli/src/args.ts`, `packages/cli/src/run.ts`, `packages/cli/src/bench.ts`, `packages/cli/src/main.ts`
- Test: `reading-guide.dto.spec.ts`, `ask.spec.ts`, `args.spec.ts`, `mascot.spec.ts`

**Interfaces:**
- Consumes: Task 5 `RunOutcome.facts`, `UserPort.confirmFact`.
- Produces: 안내서 절 — 결정 줄 끝에 확인된 근거 표시 `(근거: src/domain/money.ts:31)` / `(근거: 테스트 "…")` / `(근거: <url>)`; `⚠ 추측 (근거 확인 안 됨)` 절(결정·사실 추측); `리뷰어 추측 (근거 없는 지적)` 절; `확인 필요 (코드에 들어간 추측, 물어볼 화면이 없었음)` 절; 머리줄에 `리뷰 n회`. `Command` chat·bench에 `quick: boolean`(`--quick`). `RunContext.threePass`.
- [ ] **Step 1: 실패하는 테스트** — guide: `'확인된 근거는 결정 옆에, 추측은 따로 모아 보여 준다'`, `'리뷰어 추측과 확인 필요를 따로 보여 준다'`. ask: `toFactAnswer(index, correction)` → 0 맞음, 1 틀림+정정(빈 정정이면 맞음 아님 → `{ correct: false, correction: '(사용자가 틀렸다고 함)' }`). args: `'--quick은 리뷰와 사실 점검을 건너뛴다'`. mascot: `'추측 확인 화면은 주장과 확인하지 못한 이유를 박스에 담는다'`.
- [ ] **Step 2:** → FAIL
- [ ] **Step 3:** 구현. 확인 화면은 허락 화면과 같은 박스 + 선택 목록(`맞아요`, `틀려요 (바로잡을 내용 입력)`). bench는 noUser(묻지 않음), `--quick`도 받는다.
- [ ] **Step 4:** `yarn typecheck && yarn test` → PASS, `yarn build`
- [ ] **Step 5:** 커밋 `feat: 안내서와 화면에 추측 표시, 추측 확인, --quick` 후 push

### Task 7: 실제 실행과 비용 기록

- [ ] **Step 1:** `yarn build` 후 bench 기본(3단)으로 7요청, 그리고 `bench --quick`으로 7요청(백그라운드).
- [ ] **Step 2:** 단계별 시간·토큰, 리뷰 횟수, 추측 개수를 읽는다. S급 평균이 1단계 대비 시간 2배·비용 2.5배를 넘으면(설계 6장) 리뷰어 effort를 low로 낮춰 한 번 더 재고 둘 다 기록한다.
- [ ] **Step 3:** 실행 기록에서 추측으로 표시된 항목을 몇 개 열어, 정말 근거가 없었는지(오탐이 아닌지) 확인하고 결과를 적는다.
- [ ] **Step 4:** 결과를 설계 문서 6장 아래 "측정" 소절에 추가. 커밋 `docs: 3단 작업 bench 측정` 후 push.
