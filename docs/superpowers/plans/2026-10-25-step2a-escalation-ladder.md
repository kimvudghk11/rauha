# 2단계 A: 승격 사다리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** haiku 구현 주니어가 2회 실패하면 sonnet 구현 시니어가 실패 요약을 받아 이어서 하고, bench가 "사다리"와 "처음부터 sonnet"의 비용을 나란히 비교한다.

**Architecture:** 사다리 규칙은 이미 `WorkOrder.climbAfterFailure`에 있다. `RunScope`가 sonnet 배정을 막던 것을 푸는 새 범위(`RunScope.ladder()`), 배정 모델별 설정을 주는 `RoleSettingsDto.forAssignment`, 배정 모델을 실제 호출에 쓰는 서비스 변경, bench `--compare`가 이 계획의 전부다.

**Tech Stack:** TypeScript, vitest, Yarn 4 workspaces, `@anthropic-ai/claude-agent-sdk`

**Spec:** `docs/superpowers/specs/2026-10-25-step2-ladder-facts-chat-design.md` 3장

## Global Constraints

- 패키지 관리는 yarn만. 끝내기 전에 `yarn typecheck`와 `yarn test` 통과.
- DDD: 규칙은 엔티티·값 객체 메서드, 서비스에 도메인 `if` 금지. 생성자 private + 정적 팩토리.
- 규칙 변경은 실패하는 `*.spec.ts`부터. 테스트 이름은 한국어 규칙 문장.
- 승격 때 이전 시도의 대화 전체를 넘기지 않는다. `<handoff>`(WorkOrder 실패 요약 최근 5줄)와 `<last_failure>`만.
- 시니어 실패 시 디버깅·자문 없이 멈춘다(`needs-support`).
- 작업이 끝날 때마다 의미 단위로 커밋하고 `main`에 push한다. 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- `RAUHA_ROLE_IMPLEMENTER=sonnet`으로 고정하면 주니어 단계에서도 sonnet이 불려야 한다(비교 B가 진짜 "처음부터 sonnet"이어야 함) → Task 2 테스트.
- 시니어로 오른 뒤에도 잠긴 테스트 쓰기 거부, 범위 밖 쓰기 거부가 그대로여야 한다 → Task 3 테스트(시니어 시도에 쓰기 거부가 실패로 세어짐).
- 테스트 팀원이 무효 Red 2회로 sonnet이 될 때도 멈추지 않고 sonnet 테스트 팀원이 불려야 한다 → Task 1 테스트.
- bench `--compare`에서 한 변형이 오류로 끝나도 다른 변형과 다른 요청은 계속 돈다 → Task 4 테스트(표 함수가 오류 행을 다룸).
- 안내서의 멈춘 이유 문구가 "2단계에서 붙인다" 같은 낡은 말을 하지 않는다 → Task 3 테스트.

---

### Task 1: RunScope.ladder — sonnet 배정 허용, 시니어 실패는 멈춤

**Files:**
- Modify: `packages/core/src/orchestration/domain/run-scope.ts`
- Test: `packages/core/src/orchestration/domain/run-scope.spec.ts`

**Interfaces:**
- Produces: `RunScope.ladder(): RunScope` — red→tester, green→implementer, 허용 모델 haiku·sonnet, review 단계 도달 시 `complete`, `pendingSupport !== null`이면 `stop: needs-support`. `RunScope.minimalLoop()`는 그대로 둔다(haiku만).

- [ ] **Step 1: 실패하는 테스트 추가** — `describe('RunScope.ladder')`:
  - `'구현 주니어가 두 번 실패하면 sonnet 구현 시니어를 부른다'`: openAtRed → recordRed(red) → recordGreen(fail)×2 → `decide` = `{ kind: 'continue', assignment: { role: 'implementer', tier: 'sonnet' } }`
  - `'테스트 팀원이 무효 Red를 두 번 내면 sonnet 테스트 팀원을 부른다'`: recordRed(invalid)×2 → `{ role: 'tester', tier: 'sonnet' }`
  - `'구현 시니어까지 실패하면 디버깅 지원이 필요해 멈춘다'`: fail×3 → `{ kind: 'stop', reason: 'needs-support' }`
  - `'시니어가 통과시키면 review 단계에서 완료'`: fail×2, green → `{ kind: 'complete' }`
  - `'L급은 여전히 시작하지 않는다'`: `{ kind: 'stop', reason: 'too-large' }`
- [ ] **Step 2:** `yarn vitest run packages/core/src/orchestration/domain/run-scope.spec.ts` → `RunScope.ladder is not a function`으로 FAIL
- [ ] **Step 3:** 생성자에 허용 모델 집합(`ReadonlySet<ModelTier>`)을 받게 하고, `decide`의 `assignment.tier !== 'haiku'` 검사를 `!this.tiers.has(assignment.tier)`로 바꾼다. `minimalLoop()`은 `{haiku}`, `ladder()`는 `{haiku, sonnet}`.
- [ ] **Step 4:** 같은 명령 → PASS (기존 minimalLoop 테스트 포함)
- [ ] **Step 5:** 커밋 `feat(core): 승격 사다리 범위 — sonnet 시니어 배정 허용`

### Task 2: RoleSettingsDto.forAssignment — 배정 모델별 설정

**Files:**
- Modify: `packages/core/src/orchestration/application/dto/role-settings.dto.ts`
- Test: `packages/core/src/orchestration/application/dto/role-settings.dto.spec.ts`

**Interfaces:**
- Produces: `forAssignment(role: MemberRole, tier: ModelTier): RoleSetting` — `RAUHA_ROLE_<ROLE>`로 고정된 역할은 배정과 상관없이 고정 모델(+effort). 아니면 (role, tier) 표의 값. 표에 없는 조합은 그 역할 기본값에 tier만 바꾼다. `get(role)`은 유지(접수가 씀).
- 표 값: tester haiku = medium/30턴/$0.5, tester sonnet = medium/30턴/$1, implementer haiku = medium/40턴/$1, implementer sonnet = medium/40턴/$2.

- [ ] **Step 1: 실패하는 테스트**
  - `'구현 시니어(sonnet)는 주니어보다 예산 상한이 크다'`: `defaults().forAssignment('implementer','sonnet')` toMatchObject `{ tier: 'sonnet', effort: 'medium', maxBudgetUsd: 2 }`, haiku는 `maxBudgetUsd: 1`
  - `'환경 변수로 고정한 역할은 배정 모델과 상관없이 그 모델을 쓴다'`: `withEnv({ RAUHA_ROLE_IMPLEMENTER: 'sonnet:high' }).forAssignment('implementer','haiku')` toMatchObject `{ tier: 'sonnet', effort: 'high' }`
  - `'고정하지 않은 역할은 배정 모델을 따른다'`: `withEnv({ RAUHA_ROLE_TESTER: 'opus' }).forAssignment('implementer','sonnet').tier === 'sonnet'`
- [ ] **Step 2:** `yarn vitest run packages/core/src/orchestration/application/dto/role-settings.dto.spec.ts` → FAIL
- [ ] **Step 3:** 고정 여부를 기억하도록 `withEnv`가 고정한 역할 집합을 상태로 들고, 표(`Record<MemberRole, Partial<Record<ModelTier, RoleSetting>>>`)를 둔다.
- [ ] **Step 4:** 같은 명령 → PASS
- [ ] **Step 5:** 커밋 `feat(core): 역할 설정을 배정 모델별로`

### Task 3: 서비스가 배정 모델로 팀원을 부르고 시니어에게 승격을 알린다

**Files:**
- Modify: `packages/core/src/orchestration/application/minimal-loop.service.ts`
- Modify: `packages/core/src/orchestration/application/dto/reading-guide.dto.ts` (멈춘 이유 문구)
- Test: `packages/core/src/orchestration/application/minimal-loop.service.spec.ts`, `packages/core/src/orchestration/application/dto/reading-guide.dto.spec.ts`

**Interfaces:**
- Consumes: Task 1 `RunScope.ladder()`, Task 2 `forAssignment`.
- Produces: `RunOutcome.escalated: boolean`(구현 시니어가 한 번이라도 불렸는지), `RunOutcome.finalTier: ModelTier | null`(마지막 구현 호출 모델). 실행 기록 summary에도 같은 두 값.
- 시니어 메시지에 추가하는 블록(정확한 문구): `<escalation>\n앞의 구현 주니어(haiku)가 두 번 실패해서 승격된 시도입니다. <handoff>와 <last_failure>를 먼저 읽고, 앞 시도와 다른 접근을 하세요.\n</escalation>`

- [ ] **Step 1: 실패하는 테스트** (FakeTeam이 호출마다 `{ role, tier, message }`를 기록하도록 넓힌다)
  - `'주니어가 두 번 실패하면 시니어(sonnet)가 실패 요약을 받아 이어서 하고 완료된다'`: implementer 스크립트 [틀린 구현(money.ts='bad'), 틀린 구현, 맞는 구현('v2')] → 구현 호출 tier `['haiku','haiku','sonnet']`, 세 번째 메시지에 `<handoff>`, `<escalation>`, `<last_failure>` 포함, `outcome.status === 'complete'`, `outcome.escalated === true`, `outcome.finalTier === 'sonnet'`
  - `'시니어도 실패하면 needs-support로 멈춘다'`: 틀린 구현만 → `stopReason === 'needs-support'`, 구현 호출 3회
  - `'시니어 시도에서 잠긴 테스트를 고치면 쓰기 거부로 실패 처리한다'`: 주니어 2회 실패 뒤 시니어가 `src/money.spec.ts`를 바꿈 → `stopReason === 'needs-support'`
  - reading-guide: `'시니어까지 실패해 멈추면 다음 단계 안내를 쓴다'`: stopReason `needs-support` 안내서에 `'구현 시니어(sonnet)까지 실패했습니다'` 포함, `'2단계에서 붙입니다'` 미포함
- [ ] **Step 2:** `yarn vitest run packages/core/src/orchestration/application` → FAIL
- [ ] **Step 3:** 서비스: `RunScope.ladder()` 사용, `call()`이 `tier`를 받아 `roles.forAssignment(role, tier)`로 설정을 고른다(접수는 `roles.get('intake')`). 구현 메시지는 `order.rung !== 'junior'`일 때 `<escalation>` 블록을 넣는다 — 이 판단은 `WorkOrder`에 `isEscalated(): boolean` 메서드로 두고 서비스는 호출만 한다(Task 3 안에서 work-order.spec에 `'시니어 단계부터 승격된 업무다'` 테스트 추가). `RunTally`가 구현 호출 tier를 기록. STOP_MESSAGE: `needs-senior` → `'구현 팀원이 sonnet으로 올라가야 하는데 이번 실행 범위에서 막혔습니다.'`, `needs-support` → `'구현 시니어(sonnet)까지 실패했습니다. 디버깅·설계 자문은 다음 단계에서 붙입니다. 아래 기록의 실패 요약을 참고하세요.'`, `too-large` → `'L급 작업입니다. 설계·시니어가 필요해서 아직 시작하지 않습니다. 작업을 더 작게 나눠 다시 요청해 주세요.'`, `unsupported-stage` → `'지금 범위에서 다루지 않는 단계에 도달했습니다.'`
- [ ] **Step 4:** `yarn typecheck && yarn vitest run packages/core` → PASS
- [ ] **Step 5:** 커밋 `feat(core): 구현 시니어 승격 — 실패 요약만 넘겨 이어서 구현`

### Task 4: bench --compare와 M급 요청

**Files:**
- Modify: `packages/cli/src/args.ts`, `packages/cli/src/bench.ts`, `packages/cli/src/run.ts`, `packages/cli/src/main.ts`, `examples/bench/requests.json`
- Test: `packages/cli/src/args.spec.ts`, `packages/cli/src/bench.spec.ts`

**Interfaces:**
- Consumes: Task 3 `RunOutcome.escalated`, `finalTier`.
- Produces: `Command` bench에 `compare: boolean`. `RunContext.roleEnv?: Readonly<Record<string, string>>` — `RoleSettingsDto.defaults().withEnv({ ...process.env, ...roleEnv })`. `export function benchTable(rows: readonly BenchRow[], promptHash: string, startedAt: Date): string`. `BenchRow`에 `variant: 'ladder' | 'sonnet'`, `escalated: boolean`, `finalTier: string`.

- [ ] **Step 1: 실패하는 테스트**
  - args: `'bench --compare는 사다리와 sonnet 고정을 비교하는 실행이다'`: `parseArgs(['bench','--compare'])` toEqual `{ kind: 'bench', profile: null, only: null, compare: true }` (기존 bench 테스트 기대값에 `compare: false` 추가)
  - bench: `'비교 표는 요청마다 사다리와 sonnet 고정을 나란히 놓고 변형별 합계를 낸다'`: rows = discount(ladder 완료 $0.03, sonnet 완료 $0.08) → 표에 `'사다리'`, `'sonnet 고정'` 열 이름, 합계 줄 2개(`사다리: ...`, `sonnet 고정: ...`)
  - bench: `'한 변형이 오류여도 표를 만든다'`: sonnet 행 result `'오류'` → 표 생성, 그 행 비용 `$0.000`
  - bench: `'승격된 실행은 표에 승격을 표시한다'`: escalated true 행 → `'승격'` 포함
- [ ] **Step 2:** `yarn vitest run packages/cli` → FAIL
- [ ] **Step 3:** `--compare`이면 요청마다 `variant: 'ladder'`(roleEnv 없음), `'sonnet'`(roleEnv `{ RAUHA_ROLE_IMPLEMENTER: 'sonnet' }`) 순서로 각각 새 복사본에서 돈다(복사본 이름 `<id>-<variant>`). 표 열: 요청, 변형, 결과, 시도, 승격, 시간, haiku 토큰, sonnet 토큰, 추정 비용. `--compare`가 아니면 변형 열 없이 지금 모양 + 승격 열.
- [ ] **Step 4:** requests.json에 M급 2개 추가(id·문구 그대로):
  - `"coupon"`: `"장바구니에 쿠폰을 적용할 수 있게 해줘. 정액 쿠폰(예: 3,000원)과 정률 쿠폰(예: 10%) 두 가지가 있고, Cart에 applyCoupon을 붙이고, CartService에 쿠폰 적용 후 합계를 돌려주는 메서드를 추가해줘. 정률은 원 미만 버림, 할인 후 금액이 0원보다 작아지면 0원."`
  - `"quantity-limit"`: `"같은 상품은 장바구니에 최대 10개까지만 담기게 해줘. 넘기면 AppError로 막고, CartService.add로 담을 때도 같은 규칙이 적용돼야 해. 수량을 바꾸는 changeQuantity(productId, quantity)도 추가하고 같은 제한을 지켜."`
- [ ] **Step 5:** `yarn typecheck && yarn test` → PASS, `yarn build`
- [ ] **Step 6:** 커밋 `feat(cli): bench --compare로 사다리와 sonnet 고정 비교, M급 요청 추가` 후 push

### Task 5: 실제 비교 실행과 기록

**Files:**
- Modify: `docs/design/claude-team-design.md` (「모델」 절의 확인 안 된 절감폭에 숫자 기록)

- [ ] **Step 1:** `yarn build` 후 `RAUHA_CONFIG=<scratch config> node packages/cli/dist/main.js bench --compare` (백그라운드). 7요청 × 2변형.
- [ ] **Step 2:** 표에서 사다리 vs sonnet 고정의 완료율·평균 시간·합계 비용·승격 횟수를 읽고, 승격이 한 번도 안 일어났으면 그 사실을 그대로 적는다(절감 효과를 지어내지 않는다).
- [ ] **Step 3:** 설계 문서 32행 부근 문장에 측정 날짜와 숫자를 덧붙인다. 커밋 `docs: 승격 사다리 bench 비교 결과` 후 push.
