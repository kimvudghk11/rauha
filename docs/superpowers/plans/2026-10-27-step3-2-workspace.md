# 3-2단계 여러 저장소 작업 공간 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rauha 하나를 띄운 채로 여러 저장소를 다룬다. 저장소 여러 개를 담은 폴더에서 띄우면 그 아래 저장소를 모두 작업 공간에 넣고, 요청마다 어느 저장소 일인지 정해 그 저장소의 계정·지식·기억으로 처리한다.

**Architecture:** 새 컨텍스트 `workspace/`. 도메인 `Workspace`가 저장소 목록과 지금 저장소를 들고 "이 메시지는 어느 저장소 일인가"를 정한다(메시지에 나온 저장소 이름 → 없으면 지금 저장소 → 그래도 못 정하면 사용자에게 묻기). 응용 `WorkspaceSession`이 저장소마다 기존 `ChatSession`을 하나씩 두고 고른 저장소로 넘긴다. 여러 저장소에 걸친 질문은 첫 저장소의 세션이 답하되, 다른 저장소의 지식 묶음과 읽기 경로(`additionalDirectories`)를 함께 받는다.

**Tech Stack:** TypeScript, Node 24, Yarn 4, vitest, Claude Agent SDK.

**Spec:** [`docs/superpowers/specs/2026-10-27-repo-knowledge-workspace-design-phase-design.md`](../specs/2026-10-27-repo-knowledge-workspace-design-phase-design.md) 4장.

## Global Constraints

- yarn만. 끝내기 전에 `yarn typecheck`, `yarn test` 통과. 실패하는 테스트부터, 한국어 규칙 문장 이름.
- DDD 규칙(CLAUDE.md). 서비스에 도메인 `if` 금지.
- 저장소마다 프로필(계정)은 기존 폴더 규칙(`ProfileBook.resolve`)으로 정한다. 지식·기억·이어 갈 대화·잠금은 그 저장소 프로필 폴더를 쓴다(스펙 4.3).
- 서로 다른 프로필의 저장소에 걸친 질문은 하지 않고 이유를 알린다(스펙 4.3).
- 작업은 한 번에 저장소 하나. 여러 저장소를 고치는 요청은 "저장소별로 나눠 요청하거나, 다음 단계의 설계 대화로"라고 알린다(설계 대화는 3-3단계).
- 저장소를 고르려고 사용자에게 묻는 질문은 `notifyWhile`로 감싼다(선택 알림 규칙).
- 달러 비용 금지, 커밋은 파일 하나씩, main에 push.

## 이 계획에서 정한 것 (스펙과 다른 점)

- 스펙 4.2는 "라우터가 저장소를 고른다"였다. 이 계획은 **모델 호출 없이** 메시지에 나온 저장소 이름으로 고른다. 이름이 없으면 지금 저장소(마지막으로 다룬 저장소), 그래도 못 정하면 묻는다. 라우터 입력이 늘지 않아 매 입력 토큰이 그대로이고, 추측으로 엉뚱한 저장소를 고치는 일이 없다. 대신 "백엔드에서"처럼 이름이 아닌 말로 가리키면 묻는다(또는 `/repo`로 바꾼다).
- 스펙 4.3의 "아까 그거를 작업 공간 전체 기억에서 찾기"는 이번에 하지 않는다. "아까 그거"는 지금 저장소(=방금 다룬 저장소)의 기억에서 찾는다. 다른 저장소의 지난 작업은 이름을 말하면 그 저장소에서 찾는다.

## Review Focus

1. **저장소 이름이 다른 말의 일부일 때**: 저장소 `api`가 있을 때 "rapid하게"나 "apis"는 `api`로 잡히면 안 된다. "api에서", "api 저장소"는 잡혀야 한다 → Task 1 테스트.
2. **같은 이름의 저장소 두 개**(`work/a/api`, `work/b/api`): 이름이 겹치면 `a/api`, `b/api`로 구분한다 → Task 1 테스트.
3. **작업 공간 안에 저장소가 하나도 없음**: 지금처럼 띄운 폴더 하나로 동작한다 → Task 2 테스트.
4. **`/repo add`로 없는 경로나 git이 아닌 폴더**: 더하지 않고 이유를 알린다 → Task 2·5 테스트.
5. **여러 저장소 질문 중 한 저장소가 다른 프로필**: 팀원을 부르지 않고 이유를 알린다 → Task 4 테스트.

---

### Task 1: 도메인 — `Workspace`

**Files:**
- Create: `packages/core/src/workspace/domain/workspace.ts` + spec

**Interfaces:**
- Produces:
  - `interface WorkspaceRepo { readonly name: string; readonly root: string }`
  - `type RepoPick = { readonly kind: 'one'; readonly repo: WorkspaceRepo } | { readonly kind: 'many'; readonly repos: readonly WorkspaceRepo[] } | { readonly kind: 'ask'; readonly candidates: readonly WorkspaceRepo[] }`
  - `class Workspace { static of(roots: readonly string[], current?: string | null): Workspace; readonly repos: readonly WorkspaceRepo[]; current(): WorkspaceRepo | null; select(name: string): WorkspaceRepo | null; add(root: string): WorkspaceRepo; pick(message: string): RepoPick; mentioned(message: string): WorkspaceRepo[] }`

규칙:
- 이름은 폴더 이름(소문자 비교). 겹치면 겹치는 것들만 부모 폴더를 붙인다(`a/api`). 경로 구분자·대소문자 차이는 같은 저장소.
- `mentioned`: 메시지(소문자)에서 이름 앞뒤가 영문·숫자·`_`·`-`가 아닐 때만 맞은 것으로 본다(한글 조사는 붙어도 된다). 메시지에 나온 순서대로, 중복 없이.
- `pick`: 언급 1개 → `one`, 2개 이상 → `many`, 없으면 `current()`가 있으면 `one`, 저장소가 하나뿐이면 `one`, 아니면 `ask`(후보 = 전부).
- `select`·`pick`이 `one`을 돌려주면 그 저장소가 `current`가 된다(다음 "아까 그거"가 같은 저장소로 가게). `many`는 첫 저장소를 current로.
- `add`: 이미 있으면 그대로 돌려준다.

- [ ] **Step 1: 실패하는 테스트 작성** — `it('메시지에 나온 저장소 이름으로 고른다(한글 조사는 붙어도 된다)')`, `it('다른 말의 일부인 이름은 잡지 않는다')`(`api` vs `rapid`, `apis`), `it('두 저장소를 말하면 둘 다, 나온 순서대로')`, `it('이름이 없으면 지금 저장소, 지금 저장소가 없고 여럿이면 묻는다')`, `it('저장소가 하나면 묻지 않는다')`, `it('고른 저장소가 다음 지금 저장소가 된다')`, `it('같은 폴더 이름은 부모 폴더를 붙여 구분한다')`, `it('경로 표기가 달라도 같은 저장소는 한 번만 더한다')`.
- [ ] **Step 2: 실패 확인** → FAIL. **Step 3: 구현.** **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: 커밋** — `feat(workspace): 작업 공간 도메인 — 메시지로 저장소 고르기`.

### Task 2: 저장소 찾기와 작업 공간 저장

**Files:**
- Create: `packages/core/src/workspace/infrastructure/discover-repos.ts` + spec
- Create: `packages/core/src/workspace/infrastructure/file-workspace-store.ts` + spec
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces:
  - `discoverRepos(launchDir: string): string[]` — launchDir가 git 저장소 안이면 그 최상위 하나. 아니면 launchDir 아래 두 단계까지 `.git`이 있는 폴더(이름이 `.`으로 시작하는 폴더와 `node_modules`는 건너뜀). 없으면 `[]`.
  - `isRepo(path: string): boolean` — 있는 폴더이고 git 저장소인지.
  - `class FileWorkspaceStore { constructor(dir: string, launchDir: string); load(): Promise<{ extra: string[]; current: string | null } | null>; save(p: { extra: readonly string[]; current: string | null }): Promise<void> }` — 파일 `<dir>/<projectKey(launchDir)>.json`, `/repo add`로 더한 저장소와 마지막 지금 저장소. 깨지면 null.

- [ ] **Step 1: 실패하는 테스트 작성** — `it('저장소 안에서 띄우면 그 저장소 하나')`, `it('저장소들을 담은 폴더면 두 단계 아래까지 찾는다(node_modules·숨은 폴더 제외)')`, `it('저장소가 없으면 빈 목록')`, `it('git이 아니거나 없는 경로는 저장소가 아니다')`, store 왕복·깨짐.
- [ ] **Step 2~4**, **Step 5: 커밋** — `feat(workspace): 저장소 찾기와 작업 공간 기억`.

### Task 3: 여러 저장소에 걸친 질문 (`ChatSession`·팀원)

**Files:**
- Modify: `packages/core/src/orchestration/application/ports.ts` (`MemberCall.additionalDirectories?: readonly string[]`)
- Modify: `packages/core/src/orchestration/infrastructure/agent-sdk-team-member.ts` (옵션에 `additionalDirectories` 전달; 이 값이 있는 호출은 미리 띄운 프로세스를 쓰지 않는다)
- Modify: `packages/core/src/orchestration/application/chat-session.ts` + spec

**Interfaces:**
- Produces:
  - `interface AlsoRepo { readonly name: string; readonly root: string; readonly knowledge: KnowledgePort | null }`
  - `ChatSession.handle(input: string, also?: readonly AlsoRepo[]): Promise<TurnOutcome>`
  - `TurnOutcome`에 `| { readonly kind: 'notice'; readonly message: string }`

규칙:
- `also`가 있으면: 답변 팀원 메시지 맨 앞에 지금 저장소 지식, 그 뒤에 `also` 저장소마다 지식 묶음(없으면 `<repo name="…" root="…"/>` 한 줄), 호출에 `additionalDirectories: also.map(r => r.root)`.
- `also`가 있는데 라우터가 작업으로 판정하면 팀원을 더 부르지 않고 `{ kind: 'notice', message: '여러 저장소를 한 번에 고치는 일은 아직 하지 않아요. 저장소마다 나눠서 요청해 주세요(다음 단계의 설계 대화에서 한 번에 할 수 있게 됩니다).' }`.
- 답의 `basis`는 저장소마다 `이름: 기준`을 `, `로 이은 글.

- [ ] **Step 1: 실패하는 테스트 작성** — `it('다른 저장소도 묻는 질문은 그 저장소 지식과 읽기 경로를 함께 받는다')`, `it('여러 저장소를 고치는 작업은 하지 않고 알린다')`, `it('답에 저장소마다 읽은 기준이 붙는다')`.
- [ ] **Step 2~4**, **Step 5: 커밋** — `feat: 여러 저장소에 걸친 질문`.

### Task 4: `WorkspaceSession`

**Files:**
- Create: `packages/core/src/workspace/application/workspace-session.ts` + spec
- Modify: `packages/core/src/orchestration/application/ports.ts` (`UserPort.pickRepo?(candidates: readonly { name: string; root: string }[]): Promise<string | null>`)
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: Task 1 `Workspace`, Task 3 `ChatSession.handle(input, also)`.
- Produces:
  - `interface RepoSession { readonly repo: WorkspaceRepo; readonly profileName: string; readonly chat: ChatSession; readonly knowledge: KnowledgePort | null }`
  - `class WorkspaceSession { constructor(deps: { workspace: Workspace; open: (repo: WorkspaceRepo) => RepoSession; user: UserPort; onCurrent?: (repo: WorkspaceRepo) => void }); handle(input: string): Promise<TurnOutcome & { repo: string | null }>; select(name: string): WorkspaceRepo | null; add(root: string): WorkspaceRepo; current(): WorkspaceRepo | null; session(repo): RepoSession; sessions(): readonly RepoSession[] }`

규칙:
- `open`은 저장소마다 한 번만 부른다(세션을 다시 쓴다).
- `pick` → `ask`면 `user.pickRepo`(화면이 없거나 고르지 않으면 `notice: '어느 저장소 일인지 알려 주세요. /repo <이름>으로 고를 수 있어요.'`).
- `many`면 프로필이 모두 같은지 보고, 다르면 `notice: '<이름>은 다른 계정(<프로필>)의 저장소라서 함께 다룰 수 없어요. 저장소마다 나눠서 물어봐 주세요.'`. 같으면 첫 저장소 세션의 `handle(input, 나머지)`.
- 결과에 처리한 저장소 이름(`repo`)을 붙인다. 지금 저장소가 바뀌면 `onCurrent`.

- [ ] **Step 1: 실패하는 테스트 작성** — `it('메시지에 나온 저장소의 세션으로 보낸다')`, `it('저장소 세션은 한 번만 연다')`, `it('못 정하면 사용자에게 고르게 하고 고른 저장소로 보낸다')`, `it('화면이 없으면 묻지 않고 알린다')`, `it('두 저장소 질문은 첫 저장소가 나머지를 함께 받아 답한다')`, `it('계정이 다른 저장소에 걸친 질문은 하지 않는다')`, `it('지금 저장소가 바뀌면 알린다')`.
- [ ] **Step 2~4**, **Step 5: 커밋** — `feat(workspace): 작업 공간 세션 — 저장소마다 대화 세션을 두고 고른 저장소로 넘긴다`.

### Task 5: 대화 화면 연결과 `/repo`

**Files:**
- Modify: `packages/cli/src/chat/run-chat.ts` (저장소마다 `RepoSession` 만들기: 그 저장소 프로필로 team·knowledge·memory·snapshots·GitWorkspace·createLoop; `WorkspaceSession`으로 입력 처리; 저장소가 없으면 띄운 폴더 하나로)
- Modify: `packages/cli/src/chat/commands.ts` + spec (`/repo` → `{ kind: 'repo'; action: 'list' } | { kind:'repo'; action:'select'; name } | { kind:'repo'; action:'add'; path }`)
- Modify: `packages/cli/src/chat/describe-turn.ts` + spec (`notice`는 두 칸 들여 한 줄; 여러 저장소 작업 공간이면 결과 첫 줄 앞에 `[저장소 이름]`)
- Modify: `packages/cli/src/chat/usage-view.ts` + spec (상태 줄에 지금 저장소 이름과 브랜치)
- Modify: `packages/cli/src/main.ts` (작업 공간 찾기와 저장소별 프로필 해석을 runChat에 넘김)

화면 문구:
- `/repo`: `  작업 공간 저장소 N개` 다음 줄마다 `  ▸ 이름  브랜치  (프로필)` — 지금 저장소에만 `▸`, 나머지는 두 칸.
- `/repo <이름>`: `  지금 저장소: <이름>` / 없으면 `  <이름> 저장소가 작업 공간에 없어요. /repo로 목록을 볼 수 있어요.`
- `/repo add <경로>`: 성공 `  작업 공간에 더했어요: <이름>` / 실패 `  <경로>는 git 저장소가 아니에요.`
- 저장소 고르기 질문: `? 어느 저장소 일인가요?`, 알림 본문 `어느 저장소 일인지 골라 주세요`.

- [ ] **Step 1: 실패하는 테스트 작성** — commands·describe-turn·usage-view 스펙(위 문구 그대로).
- [ ] **Step 2~4**, **Step 5: 커밋** — `feat(chat): 여러 저장소 작업 공간과 /repo`.

### Task 6: 실제로 확인

- [ ] **Step 1: 빌드** — `yarn build`.
- [ ] **Step 2: 실제 확인 스크립트** — 임시 폴더 `ws/`에 연습 저장소 두 개(`shop-api`, `shop-web`, 각각 `freshSandbox`)를 만들고 `WorkspaceSession`을 실제 팀원으로 조립한다(화면 대신 스크립트). 순서: ① "shop-api의 Money는 뭐 하는 클래스야?" → `shop-api`가 답하고 기준이 `shop-api`의 커밋. ② "shop-api와 shop-web의 Money 차이 알려줘" → 한 답에 두 저장소 기준. ③ "shop-web에 Money끼리 크기 비교 isGreaterThan 추가해줘"(--quick) → `shop-web`만 바뀜. ④ "방금 거 왜 그렇게 했어?" → 지금 저장소 `shop-web`의 기억으로 답. 각 결과의 저장소·기준·바뀐 파일을 출력해 확인한다.
- [ ] **Step 3: 문서** — README에 작업 공간·`/repo` 한 단락, `docs/next-todo.md`에 화면 확인 항목. 커밋 `docs: 여러 저장소 작업 공간 안내`.
