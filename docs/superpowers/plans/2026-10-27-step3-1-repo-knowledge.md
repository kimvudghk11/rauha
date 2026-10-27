# 3-1단계 저장소 지식과 출처 밝히기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 저장소마다 "저장소 지식"을 한 번 만들고 그 뒤로는 git diff로 바뀐 부분만 고쳐서, 팀원이 같은 저장소를 매번 다시 훑지 않게 한다. 모든 답과 결과에 어느 브랜치·커밋을 보고 판단했는지 밝힌다.

**Architecture:** 새 컨텍스트 `knowledge/`. 도메인 `RepoRef`(브랜치·커밋·작업 트리 변경)와 `RepoKnowledge`(코드가 계산한 사실 + 심볼 지도 + 영역 메모, 기준 RepoRef) 엔티티가 "무엇이 낡았나"를 판정한다. 응용 `KnowledgeService`가 불러오기 → git 변화 → 엔티티 메서드 → 낡은 영역만 haiku 조사 팀원(`surveyor`)으로 다시 쓰기 → 저장을 한다. 대화 세션과 최소 루프는 `KnowledgePort`로 지식 묶음을 받아 접수·답변 메시지 맨 앞에 넣는다.

**Tech Stack:** TypeScript, Node 24, Yarn 4, vitest, Claude Agent SDK.

**Spec:** [`docs/superpowers/specs/2026-10-27-repo-knowledge-workspace-design-phase-design.md`](../specs/2026-10-27-repo-knowledge-workspace-design-phase-design.md) 3장, 6장 "저장소 지식 효과·최신 맞추기·출처", 9.2 "코드가 만드는 심볼 지도".

## Global Constraints

- yarn만. 끝내기 전에 `yarn typecheck`, `yarn test` 통과. 규칙 변경은 실패하는 `*.spec.ts`부터, 테스트 이름은 한국어 규칙 문장.
- DDD: domain은 Node·SDK·파일을 import하지 않는다. 바깥 입력 검증은 DTO. 생성자 private + 정적 팩토리. 서비스에 도메인 `if` 금지.
- 지식 파일 위치: `~/.rauha/profiles/<프로필>/knowledge/<projectKey>.json` (스펙 3.2). 저장소 안에 파일을 만들지 않는다.
- 비밀 파일(`SecretPolicy`)은 지식의 파일 목록·심볼·메모 어디에도 넣지 않는다.
- 메모는 읽은 파일에 있는 것만(`<no_inference>`). 메모마다 근거 파일 경로.
- "너무 많이 바뀜": 바뀐 파일이 전체의 30% 이상이거나 200개 이상이면 처음부터 다시 만든다(스펙 3.3-6).
- 달러 비용을 화면·답에 쓰지 않는다. 커밋은 파일 하나씩 지정, 메시지 끝 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, main에 push.

## Review Focus

1. **커밋이 하나도 없는 저장소·detached HEAD**: 브랜치가 없으면 커밋만으로 기준을 밝히고, 커밋이 없으면 지식을 만들지 않고 지금처럼 동작해야 한다 → Task 2 테스트.
2. **rebase나 강제 push로 기준 커밋이 사라짐**: 처음부터 다시 만든다 → Task 2·4 테스트.
3. **지식 파일이 깨졌거나 옛 형식**: 죽지 않고 다시 만든다 → Task 3 테스트.
4. **큰 저장소에서 지식 묶음이 너무 커짐**: 묶음 글자 수 상한(12,000자)을 넘으면 심볼 지도부터 줄인다 → Task 1 테스트.
5. **git이 없거나 git 저장소가 아닌 폴더**: 지식 없이 지금처럼 동작한다 → Task 4 테스트.

---

### Task 1: 도메인 — `RepoRef`, `RepoKnowledge`, 심볼 뽑기

**Files:**
- Create: `packages/core/src/knowledge/domain/repo-ref.ts` + spec
- Create: `packages/core/src/knowledge/domain/repo-knowledge.ts` + spec
- Create: `packages/core/src/knowledge/domain/symbols.ts` + spec

**Interfaces:**
- Produces:
  - `class RepoRef { static of(p: { branch: string | null; commit: string; dirty: boolean }): RepoRef; readonly branch: string | null; readonly commit: string; readonly dirty: boolean; label(): string }` — `label()`: `main (a1b2c3d)`, 브랜치가 없으면 `a1b2c3d`, `dirty`면 뒤에 ` + 작업 트리 변경`.
  - `function exportedSymbols(source: string): string[]` — TS·JS 소스에서 `export` 된 이름(function, async function, class, abstract class, const, let, interface, type, enum, `export default <이름>`, `export { a, b as c }`의 바깥 이름). 중복 없이 나온 순서대로.
  - `interface RepoFacts { readonly totalFiles: number; readonly dirs: readonly { path: string; files: number }[]; readonly packageManager: string | null; readonly scripts: Readonly<Record<string, string>>; readonly instructionFiles: readonly string[]; readonly testPattern: string | null }`
  - `interface AreaNote { readonly area: string; readonly text: string; readonly sources: readonly string[] }`
  - `class RepoKnowledge`:
    - `static create(p: { basis: RepoRef; facts: RepoFacts; symbols: ReadonlyMap<string, readonly string[]> }): RepoKnowledge` (메모 없음)
    - `static restore(p: { basis; facts; symbols; notes: readonly AreaNote[]; stale: readonly string[] }): RepoKnowledge` (DTO가 쓴다)
    - `readonly basis: RepoRef; readonly facts; readonly notes; readonly symbols`
    - `areas(): string[]` — `facts.dirs` 중 깊이 1~2 폴더(파일이 있는 곳). 루트 파일만 있는 저장소는 `.`.
    - `needsRebuild(changedCount: number): boolean` — `changedCount >= 200 || changedCount >= facts.totalFiles * 0.3`
    - `applyChanges(p: { basis: RepoRef; facts: RepoFacts; changed: ReadonlyMap<string, readonly string[] | null> }): void` — `changed`: 바뀐 파일 → 새 심볼(지워진 파일은 null). 심볼 지도 갱신, 근거 파일이 바뀐 메모의 영역과 메모 없는 새 영역을 낡음으로 표시, 기준을 바꾼다.
    - `staleAreas(): string[]` — 메모가 없거나 낡은 영역.
    - `writeNotes(notes: readonly AreaNote[]): void` — 같은 영역 메모를 바꾸고 낡음 표시를 지운다. `sources`에 지식에 없는 파일이 있으면 그 경로는 버린다(지어낸 경로 방지).
    - `toBlock(repoName: string, maxChars = 12_000): string` — `<repo_knowledge repo="…" basis="<label()>">` 안에 폴더 구조, 검사 명령, 지시 파일, 메모, 심볼 지도 순. 상한을 넘으면 심볼 지도의 파일을 뒤에서부터 뺀다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `repo-ref.spec.ts`: `it('브랜치와 짧은 커밋으로 기준을 밝힌다')` → `RepoRef.of({branch:'main', commit:'a1b2c3d4e5…', dirty:false}).label() === 'main (a1b2c3d)'`; detached → `'a1b2c3d'`; dirty → `'main (a1b2c3d) + 작업 트리 변경'`.
  - `symbols.spec.ts`: `it('내보낸 이름만 순서대로 뽑는다')` — 입력에 `export class Money`, `export async function load`, `export const A = 1, B = 2`(A만이어도 됨: `A`는 반드시 포함), `export type T =`, `export interface I`, `export enum E`, `export { x, y as z }`, `export default Cart`, 그리고 `const hidden`·`function inner`·주석 속 `// export class Fake` → 결과에 `Money, load, A, T, I, E, x, z, Cart` 포함, `hidden`·`inner`·`Fake` 없음.
  - `repo-knowledge.spec.ts`:
    - `it('바뀐 파일을 근거로 쓴 메모만 낡음이 된다')` — 영역 `src/domain`, `src/shared` 메모를 쓰고 `src/domain/money.ts`만 바꾸면 `staleAreas()` = `['src/domain']`.
    - `it('메모 없는 새 폴더에 파일이 생기면 그 영역도 낡음')`.
    - `it('지운 파일은 심볼 지도에서 빠진다')`.
    - `it('메모 근거에 지식에 없는 파일이 있으면 버린다')`.
    - `it('바뀐 파일이 200개 이상이거나 전체의 30% 이상이면 다시 만든다')` — totalFiles 10에서 3 → true, 2 → false; totalFiles 1000에서 200 → true.
    - `it('지식 묶음은 기준을 밝히고 상한을 넘으면 심볼 지도부터 줄인다')` — `toBlock('shop', 500)`에 `basis="main (a1b2c3d)"`가 있고 길이 ≤ 500, 메모 글은 남는다.
- [ ] **Step 2: 실패 확인** — `yarn vitest run packages/core/src/knowledge/domain` → FAIL(모듈 없음).
- [ ] **Step 3: 구현** — 심볼은 정규식으로 뽑는다(주석 줄은 먼저 지운다). 의존성을 더하지 않는다.
- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS.
- [ ] **Step 5: 커밋** — `feat(knowledge): 저장소 지식 도메인(기준 커밋, 심볼 지도, 낡은 영역 판정)`.

### Task 2: git으로 기준과 변화 읽기 (`GitRepoReader`)

**Files:**
- Create: `packages/core/src/knowledge/infrastructure/git-repo-reader.ts` + spec

**Interfaces:**
- Consumes: Task 1 `RepoRef`, `RepoFacts`, `exportedSymbols`; 기존 `SecretPolicy`.
- Produces: `class GitRepoReader { constructor(root: string, secrets: SecretPolicy); current(): Promise<RepoRef | null>; files(): Promise<string[]>; facts(files: readonly string[]): Promise<RepoFacts>; symbolsOf(paths: readonly string[]): Promise<Map<string, readonly string[] | null>>; changedSince(basis: RepoRef): Promise<{ readonly paths: string[] } | 'rebuild'> }`

규칙:
- `current()`: git 저장소가 아니거나 커밋이 없으면 null. 브랜치는 `git symbolic-ref --short -q HEAD`(없으면 null), 커밋 `rev-parse HEAD`, `dirty`는 `status --porcelain`이 비지 않았는지.
- `files()`: `ls-files --cached --others --exclude-standard`, `node_modules` 제외, 비밀 파일 제외. 상한 없음(지식은 전체를 센다).
- `facts()`: 폴더별 파일 수, `yarn.lock`/`pnpm-lock.yaml`/`package-lock.json`으로 패키지 관리자, 루트 `package.json`의 `scripts` 중 `test`·`typecheck`·`lint`·`build`, 지시 파일(`CLAUDE.md`, `AGENTS.md`, `README.md` 중 있는 것, 하위 폴더 포함), 테스트 패턴(`*.spec.ts`가 있으면 `*.spec.ts`, 아니면 `*.test.ts`, 둘 다 없으면 null).
- `symbolsOf()`: `.ts .tsx .js .jsx .mjs .cts .mts`만, 없는 파일은 null.
- `changedSince(basis)`: 기준 커밋이 저장소에 없으면 `'rebuild'`. `merge-base --is-ancestor basis HEAD`면 `diff --name-only basis HEAD`, 아니면 `merge-base basis HEAD` 기준으로 basis 쪽과 HEAD 쪽 diff를 합친다. 여기에 커밋 안 한 변경과 새 파일을 더한다. 비밀 파일과 `node_modules`는 뺀다.

- [ ] **Step 1: 실패하는 테스트 작성** (임시 git 저장소로)
  - `it('브랜치와 커밋, 작업 트리 변경 여부를 읽는다')`, `it('커밋이 없는 저장소나 git이 아닌 폴더는 null')`, `it('detached HEAD면 브랜치는 null')`.
  - `it('기준 뒤의 커밋과 커밋 안 한 변경을 합쳐 돌려준다')`.
  - `it('브랜치를 바꾸면 갈라진 지점 기준으로 양쪽 변경을 합친다')`.
  - `it('기준 커밋이 사라졌으면 다시 만들라고 한다')` — 존재하지 않는 해시 → `'rebuild'`.
  - `it('비밀 파일은 목록과 변화에서 뺀다')`.
  - `it('package.json 스크립트와 패키지 관리자, 지시 파일을 읽는다')`.
- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현** — `execFile('git', ['-c','core.quotepath=false', …])`, 셸 없음.
- [ ] **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: 커밋** — `feat(knowledge): git으로 기준 커밋과 바뀐 파일 읽기`.

### Task 3: 지식 파일 저장 (`RepoKnowledgeDto`, `FileKnowledgeStore`)

**Files:**
- Create: `packages/core/src/knowledge/application/dto/repo-knowledge.dto.ts` + spec
- Create: `packages/core/src/knowledge/infrastructure/file-knowledge-store.ts` + spec
- Modify: `packages/core/src/profile/domain/profile.ts` + spec (`knowledgeDir(home)` → `<home>/.rauha/profiles/<이름>/knowledge`)

**Interfaces:**
- Produces: `RepoKnowledgeDto { static fromEntity(k: RepoKnowledge): RepoKnowledgeDto; static from(input: unknown): RepoKnowledgeDto | null; toEntity(): RepoKnowledge; toJson(): string }` (`version: 1`, 틀리면 null); `class FileKnowledgeStore { constructor(dir: string, projectRoot: string); load(): Promise<RepoKnowledge | null>; save(k: RepoKnowledge): Promise<void> }` (임시 파일 → 이름 바꾸기, 깨지면 null).

- [ ] **Step 1: 실패하는 테스트 작성** — `it('저장한 지식을 그대로 되읽는다(낡음 표시 포함)')`, `it('깨졌거나 옛 형식이면 null')`, `it('다른 프로젝트 지식은 읽지 않는다')`, profile `knowledgeDir`.
- [ ] **Step 2: 실패 확인** → FAIL. **Step 3: 구현.** **Step 4: 통과 확인** → PASS.
- [ ] **Step 5: 커밋** — `feat(knowledge): 저장소 지식 파일 저장`.

### Task 4: 지식 서비스와 조사 팀원 (`KnowledgeService`, `surveyor`)

**Files:**
- Create: `packages/core/src/knowledge/application/knowledge.service.ts` + spec
- Create: `packages/core/src/knowledge/application/ports.ts` (`RepoReaderPort`, `KnowledgeStorePort` — Task 2·3 클래스 모양)
- Create: `packages/core/src/knowledge/application/dto/survey-report.dto.ts` + spec
- Create: `prompts/surveyor.md`
- Modify: `packages/core/src/orchestration/application/dto/role-settings.dto.ts` + spec (역할 `surveyor`: haiku, effort low, maxTurns 20, maxBudgetUsd 0.5, tools `['Read','Grep','Glob']`, readsProject true)
- Modify: `packages/core/src/orchestration/infrastructure/prompt-library.ts` + spec (`surveyor`는 작업 역할이 아니라 `_common.md`를 붙이지 않는다)
- Modify: `packages/core/src/orchestration/application/dto/schemas.ts` (`SURVEY_SCHEMA`: `{ notes: [{ area, text, sources: string[] }] }`, notes maxItems 20, text maxLength 600)
- Modify: `packages/core/src/orchestration/application/minimal-loop.service.ts` (`WRITE_ROLE`, `ROLE_LABEL`에 surveyor: `lead`, `저장소 파악`), `RunTally.attempts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: Task 1~3, 기존 `TeamMemberPort`, `RoleSettingsDto`, `ProgressPort`.
- Produces:
  - `interface KnowledgePort { current(): Promise<{ block: string; basis: RepoRef } | null> }`
  - `class KnowledgeService implements KnowledgePort { constructor(deps: { reader: RepoReaderPort; store: KnowledgeStorePort; team: TeamMemberPort; roles: RoleSettingsDto; progress: ProgressPort; repoName: string }); current(): Promise<{ block: string; basis: RepoRef } | null>; noteChanged(paths: readonly string[]): Promise<void> }`

흐름(`current()`):
1. `reader.current()`가 null이면 null.
2. `store.load()`가 null이면, 또는 `changedSince`가 `'rebuild'`이거나 `needsRebuild`면 → `files()`·`facts()`·`symbolsOf(files)`로 `RepoKnowledge.create`. progress `저장소를 처음 파악하는 중이에요`.
3. 아니면 바뀐 파일이 있을 때만 `applyChanges`(바뀐 파일의 심볼만 다시 뽑음).
4. `staleAreas()`가 있으면 조사 팀원을 한 번 부른다. 메시지: `<repo_facts>`(폴더 구조·명령), `<areas>`(낡은 영역과 그 안 파일 목록, 영역당 최대 40개), `<task>각 영역마다 무엇을 하는 곳인지, 들어가는 지점, 따르는 관례, 비슷한 일을 하는 기존 코드 위치를 2~4문장으로. 읽은 파일만 sources에.</task>`. `canWrite: () => false`. 실패하거나 막히면(blocked) 메모 없이 진행한다(지식의 코드 계산 부분은 그대로 쓴다).
5. 바뀐 게 있으면 `store.save`. `{ block: k.toBlock(repoName), basis: k.basis }`.

`noteChanged(paths)`: 작업이 끝난 뒤 부른다. 모델 없이 `applyChanges`만 하고 저장(메모는 다음 `current()`에서 고친다).

`surveyor.md` 요지: 영역별 짧은 메모를 쓴다, 읽은 파일에 있는 것만, 추측 금지, 파일은 고치지 않는다, 영역당 2~6개 파일만 연다, 여러 파일은 한 번에 연다.

- [ ] **Step 1: 실패하는 테스트 작성** (가짜 reader·store·team으로)
  - `it('처음에는 코드로 사실과 심볼을 만들고 조사 팀원에게 모든 영역 메모를 맡긴다')` — team 호출 1번, role `surveyor`, 저장됨, block에 basis label.
  - `it('기준과 같고 바뀐 게 없으면 팀원을 부르지 않고 저장도 하지 않는다')`.
  - `it('바뀐 파일의 영역만 다시 조사한다')` — 메시지의 `<areas>`에 그 영역만.
  - `it('기준 커밋이 사라졌으면 처음부터 다시 만든다')`.
  - `it('조사 팀원이 막히거나 실패해도 지식 묶음은 돌려준다')`.
  - `it('git 저장소가 아니면 null')`.
  - `survey-report.dto.spec.ts`: 모양 검증, 빈 notes 허용.
  - role-settings spec: `surveyor`는 haiku·읽기 도구만. prompt-library spec: `surveyor`에 공통 앞부분 없음.
- [ ] **Step 2: 실패 확인** → FAIL. **Step 3: 구현.** **Step 4: 통과 확인** — `yarn typecheck && yarn test` → PASS.
- [ ] **Step 5: 커밋** — `feat(knowledge): 지식 서비스 — diff로 낡은 영역만 haiku가 다시 조사`.

### Task 5: 지식을 접수·답변에 넣고 출처 밝히기

**Files:**
- Modify: `packages/core/src/orchestration/application/minimal-loop.service.ts` + spec (`MinimalLoopDeps.knowledge?: KnowledgePort`; 접수 메시지 맨 앞에 지식 묶음, 있으면 `<project_files>` 대신; `RunOutcome.basis: string | null`(= `basis.label()`); 끝나면 `knowledge.noteChanged(바뀐 파일)`)
- Modify: `packages/core/src/orchestration/application/dto/reading-guide.dto.ts` + spec (`ReadingGuideProps.basis: string | null`; 첫 줄 아래 `작업 기준: <basis> · 고친 곳: 작업 트리(커밋 안 함)`)
- Modify: `packages/core/src/orchestration/application/chat-session.ts` + spec (`ChatSessionDeps.knowledge?: KnowledgePort`; 답변 메시지 맨 앞에 지식 묶음; `TurnOutcome` answer에 `basis: string | null`; 작업은 `outcome.basis`)
- Modify: `packages/core/src/memory/domain/work-memory.ts` + spec (`fromWork`·`fromAnswer`에 `basis: string | null`, 점 글 끝에 `\n기준: <basis>`)
- Modify: `packages/cli/src/chat/describe-turn.ts` + spec (답 끝 줄 앞에 `  읽은 기준: <basis>`; 결과 카드 아래 `  작업 기준: <basis>`)
- Modify: `packages/cli/src/run.ts` (`createKnowledge(ctx, team): KnowledgeService` — `GitRepoReader(ctx.root, loadSecretPolicy(ctx.root))`, `FileKnowledgeStore(profile.knowledgeDir(home), projectRoot(root))`, `repoName` = 저장소 최상위 폴더 이름; `createLoop`·`runOnce`에 연결), `packages/cli/src/chat/run-chat.ts` (같은 지식 서비스를 세션과 루프가 함께 씀)

규칙:
- 접수 메시지에서 지식 묶음은 `<today>` 다음, 다른 블록보다 앞. 지식이 null이면 지금처럼 `<project_files>`.
- 대화 세션은 입력 하나마다 `knowledge.current()`를 한 번 부르고, 답변 팀원(미리 시작하는 답 포함)과 작업이 같은 결과를 쓴다. 라우터는 지식을 받지 않는다(빨라야 한다).
- `prompts/intake.md`·`answerer.md`에 한 줄: `<repo_knowledge>`는 basis 커밋 기준 요약이다. 구조를 파악하는 데 먼저 쓰고, 코드 내용은 근거로 쓰기 전에 실제 파일을 연다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - minimal-loop: `it('지식이 있으면 접수 팀장은 파일 목록 대신 지식 묶음을 맨 앞에 받는다')`, `it('결과에 작업 기준 커밋을 남기고, 끝나면 바뀐 파일을 지식에 알린다')`.
  - reading-guide: `it('안내서에 작업 기준과 고친 곳을 밝힌다')`.
  - chat-session: `it('답변 팀원은 지식 묶음을 받고 답에 읽은 기준이 붙는다')`, `it('라우터는 지식을 받지 않는다')`.
  - work-memory: `it('기억에 기준 커밋을 남긴다')`.
  - describe-turn: `it('답 아래에 읽은 기준을 한 줄 보여 준다')`.
- [ ] **Step 2: 실패 확인** → FAIL. **Step 3: 구현.** **Step 4: 통과 확인** — `yarn typecheck && yarn test` → PASS.
- [ ] **Step 5: 커밋** — `feat: 저장소 지식을 접수·답변에 넣고, 답과 결과에 기준 커밋을 밝힌다`.

### Task 6: bench `--same-repo`와 실제 측정

**Files:**
- Modify: `packages/cli/src/args.ts` + spec (`bench --same-repo` → `sameRepo: boolean`)
- Modify: `packages/cli/src/bench.ts` + spec (`sameRepo`면 연습 복사본 하나에서 요청을 차례로 돌리고, 요청 사이에 bench가 커밋한다 — bench 복사본은 rauha가 커밋하는 유일한 곳이라는 기존 규칙 그대로; 표에 `접수 토큰` 열)
- Modify: `docs/next-todo.md`, `README.md`

- [ ] **Step 1: 실패하는 테스트 작성** — args: `parseArgs(['bench','--same-repo'])` → `sameRepo: true`. bench: `benchTable`에 접수 토큰 열이 있다(기존 표 테스트 모양을 따른다).
- [ ] **Step 2: 실패 확인** → FAIL. **Step 3: 구현.** **Step 4: 통과 확인** → PASS. 커밋 `feat(bench): --same-repo — 같은 저장소에서 이어서 돌려 지식 효과를 잰다`.
- [ ] **Step 5: 실제 측정** — `yarn build` 뒤 `rauha bench --same-repo --quick --only`로는 한 요청만 돌므로, `--same-repo --quick`으로 7개 요청을 한 저장소에서 차례로 돌린다. 기대: 2번째 요청부터 접수 토큰이 첫 요청보다 작다. 첫 요청의 조사 팀원 토큰도 표에 적는다. 결과를 `docs/next-todo.md`에 숫자로 남기고 커밋 `docs: 저장소 지식 측정 결과`.
