# 2단계 C1: 대화 세션 core와 그래프 기억 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화면(Ink, C2)과 상관없이, 대화 세션이 요청을 이어 받고(`/clear` 포함), 작업과 질문을 구분해 질문엔 근거 있는 답을 바로 주고, 끝난 작업을 프로젝트별 그래프 기억에 남겨 "아까 그 기능"을 확인 후 이어서 고칠 수 있게 한다.

**Architecture:** 기억 그래프는 실제 일어난 일(업무 제목, 바뀐 파일, 잠근 테스트, 확인된 결정, 확정 가정, 질문과 답)로 코드가 만든다(도메인 `WorkMemory`). 저장은 `MemoryPort` 뒤의 SQLite 파일(프로젝트마다 하나). 세션(`ChatSession`, application)은 라우터(haiku)로 입력 종류를 정하고, 작업이면 `MinimalLoopService`, 질문이면 답변 팀원(sonnet)을 부른다. 요청마다 시작 스냅숏을 기준으로 변경을 세서, 세션 안에서 앞 요청이 남긴 미커밋 변경 위에서도 다음 요청이 돈다.

**Tech Stack:** TypeScript, vitest, `better-sqlite3`(Node 20 Windows prebuild; 설치 실패 시 `sql.js`로 대체하고 Ruling), Yarn 4

**Spec:** `docs/superpowers/specs/2026-10-25-step2-ladder-facts-chat-design.md` 5장

## Global Constraints

- 패키지 관리는 yarn만. 끝내기 전에 `yarn typecheck`와 `yarn test` 통과.
- domain은 Node·SDK·파일·SQLite를 import하지 않는다. 서비스에 도메인 `if` 금지. 생성자 private + 정적 팩토리.
- 규칙 변경은 실패하는 `*.spec.ts`부터. 테스트 이름은 한국어 규칙 문장.
- 기억은 코드가 만든다. 모델이 짐작한 연결은 넣지 않는다. "보충 → 원래 작업" 선은 사용자가 확인했을 때만.
- 기억은 프로필 폴더 아래, 프로젝트(git 저장소 최상위 경로)마다 따로. AWS·서버 없음.
- `/clear` 뒤 흐릿한 지시는 후보가 하나여도 반드시 묻는다.
- 질문 답도 근거 규칙(4장)과 같다. 기록이 없는 "왜"는 코드를 보고 추측했다고 밝힌다.
- 작업마다 커밋하고 `main`에 push. 메시지 끝 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- 세션 첫 요청 전부터 있던 사용자 변경이 있으면 시작하지 않는다 → Task 3 테스트.
- rauha가 남긴 파일을 사용자가 세션 중에 직접 고치면(내용 해시가 달라짐) 다음 요청 전에 알린다 → Task 3 테스트.
- 다른 프로젝트의 기억이 섞여 나오지 않는다 → Task 2 테스트(두 프로젝트 키로 저장 후 검색).
- 기억 후보를 사용자가 "새 작업"으로 고르면 보충 선을 만들지 않는다 → Task 5 테스트.
- 라우터 출력이 깨지면(스키마 불일치) 작업 요청으로 보고 진행한다(질문을 놓치는 쪽이 코드를 안 바꾸는 쪽보다 덜 위험하지 않으므로, 판단: 작업으로 진행하되 접수가 다시 걸러냄) → Task 5 테스트.

---

### Task 1: 기억 그래프 도메인 — WorkMemory

**Files:**
- Create: `packages/core/src/memory/domain/work-memory.ts`, `packages/core/src/memory/domain/work-memory.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export type MemoryNodeKind = 'work' | 'file' | 'test' | 'decision' | 'assumption' | 'question' | 'answer';
  export type MemoryEdgeKind = 'changed' | 'tested-by' | 'decided' | 'assumed' | 'extends' | 'answered' | 'cites';
  export interface MemoryNode { readonly id: string; readonly kind: MemoryNodeKind; readonly text: string; readonly at: string /* ISO */ }
  export interface MemoryEdge { readonly from: string; readonly to: string; readonly kind: MemoryEdgeKind }
  export interface MemoryEntry { readonly nodes: readonly MemoryNode[]; readonly edges: readonly MemoryEdge[] }
  export class WorkMemory {
    static fromWork(p: { id: string; at: string; title: string; request: string; status: 'complete' | 'stopped';
      changedFiles: readonly string[]; lockedTests: readonly string[];
      decisions: readonly { text: string; verified: boolean; rejected: string | null }[];
      assumptions: readonly { question: string; chosen: string }[]; extendsWork: string | null }): MemoryEntry;
    static fromAnswer(p: { id: string; at: string; question: string; answer: string; citedFiles: readonly string[] }): MemoryEntry;
  }
  export interface Recall { readonly work: MemoryNode; readonly neighbors: readonly MemoryNode[] }
  export function recallBlock(recalls: readonly Recall[], maxChars: number): string; // 팀장에게 넘길 짧은 글
  ```
- 파일·테스트 노드 id는 경로 그대로(`file:src/a.ts`) — 여러 작업이 같은 파일 노드를 공유한다. 작업·결정·가정·질문·답 노드 id는 `${kind}:${runId}:${n}`.
- 결정 노드 text: 확인된 근거가 있으면 `결정 — 이유 (버린 안: …)`, 없으면 앞에 `[추측] `. 멈춘 작업도 남기되 work text 끝에 ` (멈춤)`.
- [ ] **Step 1: 실패하는 테스트** — `'끝난 작업은 작업 점에 바꾼 파일·잠근 테스트·결정·확정 가정을 선으로 잇는다'`, `'같은 파일은 작업이 달라도 같은 점이다'`, `'근거 없는 결정은 [추측]으로 남긴다'`, `'보충 작업은 원래 작업으로 extends 선을 가진다'`, `'질문과 답은 답이 인용한 파일로 cites 선을 가진다'`, `'기억 묶음은 글자 수 상한 안에서 최근 것부터 자른다'`
- [ ] **Step 2:** `yarn vitest run packages/core/src/memory` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** → PASS
- [ ] **Step 5:** 커밋 `feat(core): 기억 그래프 — 실제 일어난 일로 점과 선을 만든다`

### Task 2: 기억 저장소 — SQLite, 프로젝트별

**Files:**
- Create: `packages/core/src/memory/application/memory.port.ts`, `packages/core/src/memory/infrastructure/sqlite-memory.ts`, `packages/core/src/memory/infrastructure/sqlite-memory.spec.ts`
- Modify: `packages/core/package.json`(의존성), `packages/core/src/index.ts`, `packages/core/src/profile/domain/profile.ts`(`memoryFile(home, projectRoot): string`)

**Interfaces:**
- Produces:
  ```ts
  export interface MemoryPort {
    save(entry: MemoryEntry): Promise<void>;          // 같은 id 점은 덮어쓰지 않고 유지(INSERT OR IGNORE), 선은 중복 무시
    search(text: string, limit: number): Promise<Recall[]>; // 단어 검색(FTS5) → 작업 점으로 모아 최근순 가중, 이웃 포함
    recent(limit: number): Promise<Recall[]>;
  }
  export class SqliteMemory implements MemoryPort { static open(file: string): SqliteMemory; close(): void }
  Profile.memoryFile(home, projectRoot): `<profile dir>/memory/<sha256(projectRoot 소문자 posix) 앞 12자>.db`
  ```
- 검색: 입력을 공백으로 나눈 단어를 FTS5 `OR`로 찾고, 맞은 점이 작업이 아니면 선을 따라 작업 점으로 올라간다. 점수 = FTS 순위 + 최근 가중(최근 7일 안이면 가산). 한국어는 FTS5 기본 토크나이저가 공백 단위로 나눠서 "discount"·"Money" 같은 코드 단어와 한국어 어절 단위 검색이 된다(형태소 분석 없음 — Ruling 후보).
- [ ] **Step 1:** `yarn workspace @rauha/core add better-sqlite3@11.10.0` 와 `@types/better-sqlite3`(dev). 설치·로드 확인 `node -e "require('better-sqlite3')(':memory:')"`. 실패하면 sql.js로 바꾸고 Ruling.
- [ ] **Step 2: 실패하는 테스트** — `'저장한 작업을 단어로 찾고 이웃(파일·결정)을 함께 돌려준다'`, `'결정이나 파일 이름으로 찾아도 그 작업이 나온다'`, `'다른 프로젝트 파일에 저장한 기억은 찾지 않는다'`, `'같은 점을 두 번 저장해도 하나다'`, `'최근 작업이 같은 점수면 앞에 온다'`, profile: `'기억 파일은 프로필 폴더 아래 프로젝트마다 따로다'`
- [ ] **Step 3:** → FAIL / 구현 / → PASS
- [ ] **Step 4:** 커밋 `feat(core): 기억 저장소 — 프로젝트별 SQLite`

### Task 3: 요청마다 시작 스냅숏 기준 — 세션 안에서 이어서 일하기

**Files:**
- Modify: `packages/core/src/orchestration/domain/workspace-state.ts`, `packages/core/src/orchestration/application/minimal-loop.service.ts`
- Test: `workspace-state.spec.ts`, `minimal-loop.service.spec.ts`

**Interfaces:**
- Produces: `WorkspaceState.of(dirty, carried?: ReadonlyMap<string, string>)` — carried = 세션 중 rauha가 남긴 파일 → 스냅숏 값. `assertReady(requireClean)`은 dirty 중 carried에 없거나 값이 다른 파일만 막는다(에러 메시지에 "rauha가 남긴 파일을 직접 고친 것 같습니다" 구분). `MinimalLoopDeps.carried?: ReadonlyMap<string, string>`. `RunOutcome.snapshotAfter: ReadonlyMap<string, string>`(끝난 뒤 스냅숏 — 세션이 다음 carried로 씀). `RunOutcome.changedInRun: readonly FileChange[]`(이번 요청 시작 스냅숏 대비).
- 서비스: 시작할 때 `workspace.snapshot()`을 찍어 두고, Red 판정의 "바뀐 파일"과 안내서의 "바뀐 파일·되돌리는 방법"을 `changesBetween(start, now)`로 계산한다(지금의 `changesSinceHead` 대신).
- [ ] **Step 1: 실패하는 테스트** — workspace-state: `'세션 중 rauha가 남긴 파일은 그대로면 시작을 막지 않는다'`, `'rauha가 남긴 파일을 직접 고쳤으면 알린다'`, `'세션 전부터 있던 변경은 막는다'`. service: `'앞 요청이 남긴 미커밋 변경은 이번 요청의 테스트 팀원 변경으로 세지 않는다'`(FakeWorkspace에 앞 요청 파일이 이미 바뀐 상태 + carried로 시작 → 완료, 안내서 바뀐 파일에 앞 요청 파일 없음)
- [ ] **Step 2:** → FAIL / 구현 / → PASS (기존 테스트 포함)
- [ ] **Step 3:** 커밋 `feat(core): 요청마다 시작 스냅숏 기준으로 변경을 센다`

### Task 4: 라우터와 답변 팀원, 기록 근거

**Files:**
- Modify: `role-settings.dto.ts`(`router`, `answerer` 역할), `prompt-library.ts`(ROLES), `schemas.ts`(`ROUTE_SCHEMA`, `ANSWER_SCHEMA`), `domain/fact-check.ts`(근거 종류 `record`), `dto/evidence.dto.ts`, `cli/src/mascot.ts`(역할 색·이름)
- Create: `prompts/router.md`, `prompts/answerer.md`, `dto/route.dto.ts`, `dto/answer.dto.ts` (+ spec)

**Interfaces:**
- Produces:
  - 역할 설정: router `{ tier: 'haiku', effort: 'low', maxTurns: 2, maxBudgetUsd: 0.05, tools: [] }`, answerer `{ tier: 'sonnet', effort: 'low', maxTurns: 15, maxBudgetUsd: 0.5, tools: READ_TOOLS }`.
  - `ROUTE_SCHEMA = { mode: 'work'|'question', refersToPast: boolean, pastQuery: string|null }`. `RouteDto.from(input)`; 실패 시 `RouteDto.fallback()` = `{ mode: 'work', refersToPast: false, pastQuery: null }`.
  - `ANSWER_SCHEMA = { answer: string, claims: [{ text, evidence: [근거 칸 + kind 'record'] }] (1–6) }`. `AnswerDto.from(input)`, `.claims(): Claim[]`(kind 'fact').
  - 근거 종류 `{ kind: 'record'; text: string }` — `EvidenceSources.records: readonly string[]`(기억에서 꺼내 넘긴 결정·가정 문장)에 그 문장이 있으면 인정. 스키마 근거 칸의 kind enum에 'record' 추가(구현 보고에서도 쓸 수 있으나 구현 프롬프트는 언급하지 않음).
  - router.md: 입력이 코드를 바꾸는 요청인지(work) 코드를 안 바꾸는 질문인지(question), 지난 작업을 흐릿하게 가리키는지(refersToPast; "아까 그 기능", "방금 거", 이름 없이 가리킴)와 기억 검색어(pastQuery). `<conversation>`이 주어지면 그 안에서 바로 가리키는 대상이 있으면 refersToPast는 false(세션 대화로 충분).
  - answerer.md: `<memory>`의 기록된 결정·이유를 먼저 쓰고 그 문장을 record 근거로 단다. 기록이 없으면 코드를 읽고 답하되 "기록된 이유가 아니라 코드를 보고 추측한 것"이라고 answer 첫 문장에 밝히고 그 주장들의 근거는 code로 단다. 열지 않은 것을 확인했다고 말하지 않는다.
- [ ] **Step 1: 실패하는 테스트** — fact-check: `'기억에 있는 문장만 record 근거로 인정한다'`. route.dto: `'라우터 출력을 읽고, 깨졌으면 작업으로 본다'`. answer.dto: `'답의 주장을 근거와 함께 읽는다'`. role-settings: `'라우터는 도구 없는 haiku, 답변은 읽기만 하는 sonnet'`. prompt-library: 역할 7개 파일.
- [ ] **Step 2–4:** FAIL / 구현 / PASS
- [ ] **Step 5:** 커밋 `feat: 라우터와 답변 팀원, 기록 근거`

### Task 5: ChatSession — 세션, /clear, 질문 답하기, "아까 그 기능" 확인, 기억 남기기

**Files:**
- Create: `packages/core/src/orchestration/application/chat-session.ts`, `chat-session.spec.ts`
- Modify: `minimal-loop.service.ts`(`run(request, context?: RunContextBlocks)` — 접수 메시지에 `<conversation>`, `<past_work>`를 넣는다), `ports.ts`(`UserPort.pickPast`), `index.ts`

**Interfaces:**
- Consumes: Task 1–4, `MinimalLoopService`.
- Produces:
  ```ts
  export interface RunContextBlocks { readonly conversation: string | null; readonly pastWork: string | null }
  UserPort.pickPast(candidates: readonly { id: string; title: string; at: string }[]): Promise<string | null>; // null = 새 작업
  export type TurnOutcome =
    | { kind: 'work'; outcome: RunOutcome }
    | { kind: 'answer'; answer: string; checked: readonly CheckedClaim[]; costUsd: number; durationMs: number };
  export class ChatSession {
    static start(deps: ChatSessionDeps): ChatSession;   // deps: loop 생성 함수(carried를 받아 MinimalLoopService를 만듦), team, workspace, memory, user, progress, roles, now, newId, today
    handle(input: string): Promise<TurnOutcome>;
    clear(): void;                                       // 세션 대화만 비움. carried·기억은 유지
    status(): { turns: number; carriedFiles: number; lastTitle: string | null };
    usage(): { costUsd: number; calls: Readonly<Record<ModelTier, number>> };
  }
  ```
- 흐름(한 입력):
  1. 라우터 호출(`<conversation>` 최근 6턴 요약 + 입력). 
  2. refersToPast면 `memory.search(pastQuery ?? input, 3)` → 후보가 있으면 `user.pickPast` (하나여도 묻는다; interactive가 아니면 묻지 않고 새 작업). 고르면 그 작업의 `recallBlock`을 `<past_work>`로.
  3. question이면 `memory.search(input, 3)` 묶음을 `<memory>`로 넣어 답변 팀원 호출 → `FactCheck.of(answer.claims(), { files: 인용 파일 읽기, passedTests: [], fetched, userStatements: [], records: 기억 문장 })` → 기억에 `WorkMemory.fromAnswer` 저장 → TurnOutcome answer.
  4. work면 `MinimalLoopService.run(input, { conversation, pastWork })` (carried 전달) → 기억에 `WorkMemory.fromWork`(확인된 결정만 verified, 고른 과거 작업이면 extendsWork) 저장 → carried ← `outcome.snapshotAfter` 중 이번 세션에서 바뀐 파일 → 세션 대화에 `{input, 결과 한 줄}` 추가.
- [ ] **Step 1: 실패하는 테스트** — `'질문이면 테스트·구현 없이 답하고, 근거가 확인된 주장과 추측을 나눈다'`, `'왜 이렇게 짰냐는 질문에는 기억된 결정을 근거로 답한다'`(memory에 결정이 있고 answer가 record 근거로 그 문장을 인용 → verified), `'작업이 끝나면 기억에 남고 다음 질문에서 찾힌다'`, `'clear 뒤 흐릿한 지시는 후보를 묻고, 고른 작업을 past_work로 넘기고 보충 선을 만든다'`, `'후보를 새 작업으로 고르면 보충 선을 만들지 않는다'`, `'화면이 없으면 후보를 묻지 않고 새 작업으로 진행한다'`, `'clear는 세션 대화만 비우고 기억과 이어 일할 파일은 남긴다'`, `'라우터 출력이 깨지면 작업으로 진행한다'`, `'두 번째 요청은 첫 요청이 남긴 변경 위에서 시작한다'`
- [ ] **Step 2–4:** FAIL / 구현 / PASS (`yarn typecheck && yarn test`)
- [ ] **Step 5:** 커밋 `feat(core): 대화 세션 — 질문 답하기, 기억 찾기, /clear` 후 push

### Task 6: -p 실행도 기억에 남기기

**Files:**
- Modify: `packages/cli/src/run.ts`, `packages/cli/src/main.ts`

- [ ] **Step 1:** `-p` 실행이 끝나면 같은 기억 저장소에 `WorkMemory.fromWork`로 남긴다(bench는 임시 복사본이라 남기지 않음 — 프로젝트 키가 매번 달라 의미 없음). 저장 실패는 실행을 실패시키지 않고 진행 표시에 한 줄로 알린다.
- [ ] **Step 2:** `yarn typecheck && yarn test`, `yarn build`, 커밋 `feat(cli): -p 실행도 기억에 남긴다` 후 push
