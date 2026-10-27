# 3-0단계 작은 보강 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 다른 하네스와 비교해 바로 메울 수 있는 세 가지를 넣는다: 비밀 파일 막기, `/review`(내 변경 검토), 대화 이어 가기(`--continue`).

**Architecture:** 비밀 파일 규칙은 도메인 값 객체 `SecretPolicy`가 판정하고, 도구 가드(`tool-guard`)와 rauha 자신의 파일 읽기(`GitWorkspace.readFile`)가 그 판정을 따른다. `/review`는 기존 리뷰어 역할과 사실 점검(`FactCheck`)을 업무 지시서 없이 다시 쓴다. 대화 이어 가기는 `ChatSession`이 상태를 스냅숏으로 내보내고 다시 받는 메서드를 갖고, 파일 저장은 인프라 어댑터가 한다.

**Tech Stack:** TypeScript, Node 24, Yarn 4 workspaces, vitest, Claude Agent SDK 0.3.296, ink.

**Spec:** [`docs/superpowers/specs/2026-10-27-repo-knowledge-workspace-design-phase-design.md`](../specs/2026-10-27-repo-knowledge-workspace-design-phase-design.md) 7장 0단계, 9.2절. 9.2의 "코드가 만드는 심볼 지도"는 저장소 지식 저장소가 필요해 1단계 계획으로 옮긴다. 8장의 AGENTS.md 확인은 끝났다: 2026-10-27 실제 haiku 호출에서 `settingSources: ['project']`로 CLAUDE.md 없는 폴더의 AGENTS.md를 읽었다(할 일 없음).

## Global Constraints

- 패키지 관리는 yarn만. 끝내기 전에 `yarn typecheck`와 `yarn test` 통과.
- DDD: domain은 Node API·SDK·파일을 import하지 않는다. 바깥 입력 검증·변환은 DTO 메서드. 생성자는 private + 정적 팩토리. 서비스에 도메인 `if`를 쓰지 않는다.
- 규칙을 바꿀 때는 실패하는 `*.spec.ts`부터. 테스트 이름은 한국어 규칙 문장.
- 화면과 답에 달러 비용을 쓰지 않는다. 사용자에게 고르게 하는 새 질문은 `notifyWhile`로 감싼다(이번 계획에는 새 질문이 없다).
- 커밋은 파일을 하나씩 지정한다(`git add -A` 금지). 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. 큰따옴표가 든 메시지는 PowerShell에서 깨지므로 `git commit -F <파일>`을 쓴다. main에 바로 push.
- rauha는 커밋하지 않는다. 비밀 파일 내용은 rauha 메시지, 실행 기록, 기억 어디에도 들어가면 안 된다.

## Review Focus

1. **대소문자·구분자가 다른 경로**: Windows에서 `E:\repo\.ENV`나 `config\Prod.Key` 같은 경로도 비밀 파일로 막혀야 한다 → Task 1 테스트.
2. **예시 파일은 허용**: `.env.example`, `.env.sample`, `.env.template`은 읽을 수 있어야 한다(설정 방법을 아는 데 필요) → Task 1 테스트.
3. **검토할 변경이 없을 때**: `/review`는 모델을 부르지 않고 "검토할 변경이 없어요"로 끝나야 한다 → Task 3 테스트.
4. **이상한 브랜치 이름**: `/review --output=x`처럼 `-`로 시작하거나 없는 브랜치는 git 옵션으로 넘어가지 않고 알기 쉬운 오류가 나야 한다 → Task 3 테스트.
5. **깨진 이어 가기 파일**: 저장된 대화 파일이 깨졌거나 옛 형식이면 죽지 않고 새 대화로 시작해야 한다 → Task 5 테스트.

알고 받아들이는 한계: 저장소 전체를 훑는 Grep(경로 지정 없음)의 결과에 비밀 파일 줄이 섞이는 것은 이번 단계에서 막지 않는다. Grep의 `path`가 비밀 파일이면 막는다.

---

### Task 1: 비밀 파일 규칙 (`SecretPolicy`, `RauhaIgnoreDto`)

**Files:**
- Create: `packages/core/src/orchestration/domain/secret-policy.ts`
- Create: `packages/core/src/orchestration/domain/secret-policy.spec.ts`
- Create: `packages/core/src/orchestration/application/dto/rauha-ignore.dto.ts`
- Create: `packages/core/src/orchestration/application/dto/rauha-ignore.dto.spec.ts`
- Modify: `packages/core/src/index.ts` (두 클래스 내보내기)

**Interfaces:**
- Produces:
  - `class SecretPolicy { static defaults(): SecretPolicy; static of(extraPatterns: readonly string[]): SecretPolicy; isSecret(relPath: string): boolean; secretIn(command: string): string | null }`
  - `class RauhaIgnoreDto { static from(text: string | null): RauhaIgnoreDto; toEntity(): SecretPolicy }`

규칙(스펙 9.2):
- 기본 목록: `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.keystore`, `id_rsa*`, `id_ed25519*`, `.npmrc`, `.pypirc`, `credentials.json`.
- 기본 목록의 예외: 이름이 `.example`, `.sample`, `.template`으로 끝나는 파일.
- `/`가 없는 패턴은 파일 이름(마지막 조각)에, `/`가 있는 패턴은 저장소 기준 전체 경로에 맞춘다. `shared/path-pattern.ts`의 `matchesPattern`을 쓴다.
- 비교 전에 `\`를 `/`로 바꾸고 소문자로 맞춘다.
- `.rauhaignore`: 한 줄에 패턴 하나, 빈 줄과 `#`으로 시작하는 줄은 무시, 앞뒤 공백 제거. 기본 목록에 더해진다.

- [ ] **Step 1: 실패하는 테스트 작성** (`secret-policy.spec.ts`)

```ts
describe('SecretPolicy', () => {
  const p = SecretPolicy.defaults();
  it('기본 비밀 파일은 어느 폴더에 있어도 막는다', () => {
    for (const path of ['.env', 'apps/api/.env.production', 'certs/server.pem', 'keys/id_rsa', '.npmrc']) expect(p.isSecret(path)).toBe(true);
  });
  it('예시 파일은 비밀이 아니다', () => {
    for (const path of ['.env.example', 'config/.env.sample', '.env.template']) expect(p.isSecret(path)).toBe(false);
  });
  it('Windows 구분자와 대문자도 같은 파일로 본다', () => {
    expect(p.isSecret('config\\Prod.KEY')).toBe(true);
    expect(p.isSecret('.ENV')).toBe(true);
  });
  it('보통 소스 파일은 막지 않는다', () => {
    for (const path of ['src/env.ts', 'src/keyboard.ts', 'README.md']) expect(p.isSecret(path)).toBe(false);
  });
  it('추가 패턴은 경로째로도 맞춘다', () => {
    expect(SecretPolicy.of(['secrets/**']).isSecret('secrets/db/password.txt')).toBe(true);
  });
  it('셸 명령에 비밀 파일이 나오면 그 이름을 돌려준다', () => {
    expect(p.secretIn('cat .env | head')).toBe('.env');
    expect(p.secretIn('type "config\\.env.local"')).toBe('config\\.env.local');
    expect(p.secretIn('yarn test')).toBeNull();
  });
});
```

`rauha-ignore.dto.spec.ts`:

```ts
it('빈 줄과 주석은 버리고 나머지 패턴을 기본 목록에 더한다', () => {
  const policy = RauhaIgnoreDto.from('# 비밀\n\n  secrets/**  \nprod.json\n').toEntity();
  expect(policy.isSecret('secrets/a.txt')).toBe(true);
  expect(policy.isSecret('prod.json')).toBe(true);
  expect(policy.isSecret('.env')).toBe(true);
});
it('파일이 없으면 기본 목록만', () => {
  expect(RauhaIgnoreDto.from(null).toEntity().isSecret('prod.json')).toBe(false);
});
```

- [ ] **Step 2: 실패 확인** — `yarn vitest run packages/core/src/orchestration/domain/secret-policy.spec.ts packages/core/src/orchestration/application/dto/rauha-ignore.dto.spec.ts` → 모듈 없음으로 FAIL.
- [ ] **Step 3: 구현** — 위 시그니처대로. `secretIn`은 명령을 공백·따옴표·`|;&<>`로 나눈 단어마다 `isSecret`을 본다.
- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS.
- [ ] **Step 5: 커밋** — `feat: 비밀 파일 규칙(SecretPolicy, .rauhaignore)`.

### Task 2: 팀원과 rauha가 비밀 파일을 읽거나 쓰지 못하게 하기

**Files:**
- Modify: `packages/core/src/orchestration/infrastructure/tool-guard.ts` (옵션 `secrets: SecretPolicy`, 맨 앞에서 검사)
- Modify: `packages/core/src/orchestration/infrastructure/tool-guard.spec.ts`
- Modify: `packages/core/src/orchestration/infrastructure/git-workspace.ts` (생성자 두 번째 인자 `secrets: SecretPolicy = SecretPolicy.defaults()`, `readFile`이 비밀이면 null)
- Modify: `packages/core/src/orchestration/infrastructure/git-workspace.spec.ts`
- Create: `packages/core/src/orchestration/infrastructure/load-secret-policy.ts` (`loadSecretPolicy(root: string): SecretPolicy` — `<root>/.rauhaignore`를 동기로 읽어 `RauhaIgnoreDto`로)
- Modify: `packages/core/src/orchestration/infrastructure/agent-sdk-team-member.ts` (`AgentSdkTeamMemberOptions.secrets`, `createToolGuard`에 넘김)
- Modify: `packages/cli/src/run.ts` (`createTeam`과 `createLoop`의 `GitWorkspace`에 `loadSecretPolicy(ctx.root)` 전달), `packages/cli/src/chat/run-chat.ts` (`new GitWorkspace(workDir, …)`)
- Modify: `packages/core/src/index.ts` (`loadSecretPolicy` 내보내기)

**Interfaces:**
- Consumes: Task 1의 `SecretPolicy`, `RauhaIgnoreDto`.
- Produces: `ToolGuardOptions.secrets: SecretPolicy`; `new GitWorkspace(root: string, secrets?: SecretPolicy)`; `loadSecretPolicy(root: string): SecretPolicy`.

가드 규칙: `Read`·`Edit`·`Write`·`MultiEdit`·`NotebookEdit`의 `file_path`/`notebook_path`, `Grep`·`Glob`의 `path`가 저장소 기준 상대 경로로 비밀이면, 그리고 `Bash`·`PowerShell`의 `command`에 `secretIn`이 걸리면 묻지 않고 거절한다. 거절 이유: `비밀 파일(<이름>)은 rauha 팀원이 읽거나 쓸 수 없습니다(.rauhaignore와 기본 목록). 그 값 없이 할 수 있는 방법을 쓰세요.`

- [ ] **Step 1: 실패하는 테스트 작성**
  - `tool-guard.spec.ts`: `it('비밀 파일은 읽기·쓰기·셸 모두 묻지 않고 거절한다')` — `Read {file_path: '<root>/.env'}`, `Grep {path: '.env.local'}`, `Bash {command: 'cat .env'}` 각각 `permissionDecision === 'deny'`이고 `ask`가 불리지 않는다. `it('예시 파일은 그대로 읽게 둔다')` — `Read {file_path: '<root>/.env.example'}`는 결정을 내리지 않는다(`{}`).
  - `git-workspace.spec.ts`: `it('비밀 파일은 rauha도 읽지 않는다(null)')` — 저장소에 `.env`를 쓰고 `readFile('.env')`가 null, `readFile('.env.example')`은 내용.
- [ ] **Step 2: 실패 확인** — `yarn vitest run packages/core/src/orchestration/infrastructure/tool-guard.spec.ts packages/core/src/orchestration/infrastructure/git-workspace.spec.ts` → 새 테스트 FAIL.
- [ ] **Step 3: 구현** — 위 Files대로. 기존 가드 테스트의 옵션에는 `secrets: SecretPolicy.defaults()`를 더한다.
- [ ] **Step 4: 통과 확인** — `yarn typecheck && yarn test` → 전부 PASS.
- [ ] **Step 5: 커밋** — `feat: 팀원과 rauha가 비밀 파일을 읽거나 쓰지 않는다`.

### Task 3: 내 변경 검토 (`ChatSession.review`)

**Files:**
- Modify: `packages/core/src/orchestration/application/ports.ts` (`WorkspacePort.reviewChanges(target: string | null): Promise<FileChange[]>`)
- Modify: `packages/core/src/orchestration/infrastructure/git-workspace.ts` + spec
- Modify: `packages/core/src/orchestration/application/chat-session.ts` + spec (`ChatSessionDeps.workspace`를 `Pick<WorkspacePort, 'readFile' | 'reviewChanges'>`로)
- Modify: `prompts/reviewer.md` (`<without_work_order>` 절 추가)

**Interfaces:**
- Consumes: `FilesBlockDto`(기존), `ReviewReportDto`, `FactCheck`, `REVIEWER_REPORT_SCHEMA`.
- Produces:
  - `TurnOutcome`에 `| { readonly kind: 'review'; readonly target: string | null; readonly files: readonly string[]; readonly checked: readonly CheckedClaim[]; readonly summary: string; readonly durationMs: number }`
  - `ChatSession.review(target: string | null): Promise<TurnOutcome>` (`review` 또는 `blocked`)

규칙:
- `reviewChanges(null)`: 지금 `HEAD` 대비 바뀐 파일(커밋 안 한 것) + 추적 안 하는 새 파일. 세션 시작 커밋이 아니라 호출할 때의 `HEAD`.
- `reviewChanges(ref)`: `ref`가 `-`로 시작하거나 `git rev-parse --verify <ref>^{commit}`이 실패하면 `DomainError('UNKNOWN_REF', '<ref> 브랜치나 커밋을 찾지 못했어요.')`. 있으면 `git merge-base <ref> HEAD` 대비 diff + 커밋 안 한 변경 + 새 파일.
- 바뀐 파일이 없으면 모델을 부르지 않고 `{ kind: 'review', files: [], checked: [], summary: '' }`.
- 리뷰어 메시지: `<today>`, `<review_request>`(대상 설명: "커밋하지 않은 변경" 또는 "`<ref>`와 갈라진 뒤의 변경"), `<changed_files>`, `FilesBlockDto`로 만든 `<files>`(삭제 제외), `<task>사용자가 직접 만든 변경을 검토하세요. 업무 지시서는 없습니다. 파일은 고치지 않습니다.</task>`.
- 리뷰 보고의 주장은 `FactCheck.of(claims, { files: 인용된 파일 내용, passedTests: [], fetched, userStatements: [], records: [] })`로 확인한다. 기억에는 남기지 않는다. 대화 턴에는 `검토: 지적 N개`로 남긴다.
- `reviewer.md` 추가 문장: 업무 지시서가 없으면(`<review_request>`) 수용 기준 대신 버그, 이 저장소의 기존 구조·관례와 어긋남, 근거 없는 외부 사실만 본다. 나머지 규칙은 같다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `git-workspace.spec.ts`: `it('검토 대상: 커밋 안 한 변경과 새 파일')`, `it('검토 대상: 브랜치와 갈라진 뒤의 변경')`(새 브랜치에서 커밋 하나 + 작업 트리 변경 → 둘 다 나옴, main의 다른 커밋은 안 나옴), `it('없는 브랜치나 -로 시작하는 이름은 알기 쉬운 오류')`.
  - `chat-session.spec.ts`: `it('바뀐 파일이 없으면 리뷰어를 부르지 않는다')`, `it('근거가 확인된 지적과 추측을 나누고 기억에는 남기지 않는다')`(리뷰어 가짜가 code 근거 하나 맞는 것과 근거 없는 것 하나 → `checked.map(c => c.isGuess)`가 `[false, true]`, `memory.nodes.size === 0`), `it('리뷰어는 바뀐 파일 내용을 <files>로 받는다')`.
- [ ] **Step 2: 실패 확인** — 해당 spec 두 개 실행 → 새 테스트 FAIL.
- [ ] **Step 3: 구현** — 위 규칙대로. `FakeWorkspace`가 쓰는 테스트 가짜들에 `reviewChanges`를 더한다.
- [ ] **Step 4: 통과 확인** — `yarn typecheck && yarn test` → PASS.
- [ ] **Step 5: 커밋** — `feat: /review — 내 변경을 리뷰어가 근거와 함께 검토한다 (코어)`.

### Task 4: `/review` 명령과 화면

**Files:**
- Modify: `packages/cli/src/chat/commands.ts` + spec (`ChatCommand`에 `{ kind: 'review'; target: string | null }`, 도움말 `내 변경(커밋 안 한 것, 또는 /review <브랜치>로 그 브랜치와 갈라진 뒤)을 리뷰어가 검토해요. 파일은 고치지 않아요.`)
- Modify: `packages/cli/src/chat/describe-turn.ts` + spec
- Modify: `packages/cli/src/chat/run-chat.ts` (`case 'review'`: 바쁨 표시 → `session.review(target)` → `describeTurn`; `DomainError`는 지금처럼 `rauha: …` 한 줄)

**Interfaces:**
- Consumes: Task 3의 `ChatSession.review`, `TurnOutcome` `review`.

화면 규칙(`describeTurn` `review`):
- 파일 0개: `  검토할 변경이 없어요.`
- 그 밖: 첫 줄 `  검토 대상: 커밋하지 않은 변경 · 파일 N개` 또는 `  검토 대상: <ref>와 갈라진 뒤의 변경 · 파일 N개`, 다음 `summary`, 근거가 확인된 지적만 `  - <text>` 목록(없으면 `  근거가 확인된 문제는 없어요.`), 확인 안 된 지적이 있으면 `  근거를 확인하지 못한 지적 N개는 뺐어요.`, 끝에 경과 시간.

- [ ] **Step 1: 실패하는 테스트 작성** — `commands.spec.ts`: `parseCommand('/review')` → `{kind:'review', target:null}`, `parseCommand('/review develop')` → `target:'develop'`, 제안 목록에 `/review`. `describe-turn.spec.ts`: 위 화면 규칙 세 경우(변경 없음, 확인된 지적 1·뺀 지적 1, 확인된 지적 없음).
- [ ] **Step 2: 실패 확인** — 두 spec 실행 → FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인** — `yarn typecheck && yarn test` → PASS.
- [ ] **Step 5: 커밋** — `feat(chat): /review 명령`.

### Task 5: 대화 상태 내보내기·되살리기 (`ChatSnapshotDto`)

**Files:**
- Create: `packages/core/src/orchestration/application/dto/chat-snapshot.dto.ts` + spec
- Modify: `packages/core/src/orchestration/application/chat-session.ts` + spec
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces:
  - `interface ChatSnapshot { readonly version: 1; readonly turns: readonly { input: string; result: string }[]; readonly carried: readonly [string, string][]; readonly lastTitle: string | null; readonly savedAt: string }`
  - `class ChatSnapshotDto { static from(input: unknown): ChatSnapshotDto | null; static of(snapshot: ChatSnapshot): ChatSnapshotDto; toJson(): string; readonly value: ChatSnapshot }` — `from`은 모양이 틀리거나 `version !== 1`이면 null(던지지 않는다).
  - `ChatSession.snapshot(savedAt: string): ChatSnapshot`, `static ChatSession.resume(deps: ChatSessionDeps, snapshot: ChatSnapshot): ChatSession` (`start`처럼 라우터·답변 팀원을 미리 띄운다).

- [ ] **Step 1: 실패하는 테스트 작성** — `chat-snapshot.dto.spec.ts`: `it('저장한 대화를 그대로 되읽는다')`(of → toJson → JSON.parse → from 왕복), `it('깨진 내용이나 옛 형식은 null')`(`null`, `'x'`, `{version:2,...}`, `turns`가 배열 아님). `chat-session.spec.ts`: `it('이어 간 세션은 앞 대화와 이어 일할 파일을 그대로 쓴다')` — 작업 한 번 → `snapshot` → `resume` → 다음 작업의 `context.conversation`에 첫 요청이 있고 `carried`가 같다, `status().turns === 1`.
- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인** — `yarn typecheck && yarn test` → PASS.
- [ ] **Step 5: 커밋** — `feat: 대화 세션 상태를 저장하고 되살린다 (코어)`.

### Task 6: 대화 파일 저장소와 저장소 키 정리

**Files:**
- Create: `packages/core/src/shared/project-key.ts` + `project-key.spec.ts` (`projectKey(projectRoot: string): string` — 지금 `projectMemoryFile`·`projectLockFile`이 각자 쓰는 "소문자 POSIX 경로의 sha256 앞 12자"를 한곳으로. Node `crypto`를 쓰므로 domain에서는 import하지 않는다)
- Modify: `packages/core/src/memory/infrastructure/sqlite-memory.ts`, `packages/core/src/orchestration/infrastructure/file-work-lock.ts` (`projectKey` 사용, 결과 경로는 그대로 — 기존 spec이 같은 키를 확인)
- Create: `packages/core/src/orchestration/infrastructure/file-chat-snapshots.ts` + spec
- Modify: `packages/core/src/profile/domain/profile.ts` + spec (`sessionsDir(home)` → `<home>/.rauha/profiles/<이름>/sessions`)
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces:
  - `projectKey(projectRoot: string): string` (`packages/core/src/shared/project-key.ts`)
  - `class FileChatSnapshots { constructor(dir: string, projectRoot: string); save(snapshot: ChatSnapshot): Promise<void>; load(): Promise<ChatSnapshot | null> }` — 파일 `<dir>/<projectKey>.json`. 쓰기는 같은 폴더의 임시 파일에 쓴 뒤 이름 바꾸기(중간에 끊겨도 반쪽 파일이 남지 않게). 읽기 실패·깨짐은 null.

- [ ] **Step 1: 실패하는 테스트 작성** — `file-chat-snapshots.spec.ts`: `it('저장한 대화를 같은 프로젝트에서 되읽는다')`, `it('다른 프로젝트 대화는 읽지 않는다')`, `it('파일이 없거나 깨졌으면 null')`. `profile.spec.ts`: `sessionsDir`.
- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현** — 기존 두 곳의 해시 코드를 `projectKey`로 바꾼다(기존 spec이 그대로 통과해야 한다).
- [ ] **Step 4: 통과 확인** — `yarn typecheck && yarn test` → PASS.
- [ ] **Step 5: 커밋** — `feat: 대화 상태 파일 저장소, 프로젝트 키를 한곳으로`.

### Task 7: `rauha --continue`와 `/update` 뒤 자동 이어 가기

**Files:**
- Modify: `packages/cli/src/args.ts` + spec (`-c`, `--continue` → chat 명령의 `resume: true`. chat 명령 모양은 `{ kind: 'chat'; profile; prompt; quick; resume: boolean }`; 기존 `toEqual` 테스트에 `resume: false`를 더한다)
- Modify: `packages/cli/src/main.ts` (HELP에 `rauha --continue  지난 대화를 이어서 열기 (-c)`, `runChat`에 `resume` 전달)
- Modify: `packages/cli/src/chat/run-chat.ts`
- Modify: `packages/cli/src/update.ts` + spec (`withContinue(args: readonly string[]): string[]` — `-c`·`--continue`가 없으면 끝에 `--continue`를 더한다)

**Interfaces:**
- Consumes: Task 5의 `ChatSession.snapshot/resume`, Task 6의 `FileChatSnapshots`, `Profile.sessionsDir`.
- Produces: `ChatOptions.resume: boolean`; `withContinue`.

동작:
- 대화 화면은 입력 하나를 처리한 뒤와 `/clear` 뒤마다 `snapshots.save(session.snapshot(new Date().toISOString()))`. 저장 실패는 대화를 막지 않는다(조용히 넘어감).
- `resume`이고 저장된 대화가 있으면 `ChatSession.resume`, 첫 줄에 `  지난 대화를 이어요 · 대화 N번 · 마지막 작업: <title 또는 없음>`. 없으면 `ChatSession.start`, 첫 줄 `  이어 갈 대화가 없어서 새로 시작해요.`
- `/update`로 다시 띄울 때 `relaunch(…, withContinue(process.argv.slice(2)))`.
- `-p`와 `--continue`를 같이 쓰면 `--continue`는 무시한다(한 번 실행은 대화가 없다).

- [ ] **Step 1: 실패하는 테스트 작성** — `args.spec.ts`: `parseArgs(['-c'])`, `parseArgs(['--continue'])` → `resume: true`. `update.spec.ts`: `withContinue([])` → `['--continue']`, `withContinue(['-c'])` → `['-c']`, `withContinue(['--profile','work'])` → `['--profile','work','--continue']`.
- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현** — `run-chat.ts`의 저장·되살리기 연결은 화면 테스트가 없으므로 Task 8에서 실제로 확인한다.
- [ ] **Step 4: 통과 확인** — `yarn typecheck && yarn test` → PASS.
- [ ] **Step 5: 커밋** — `feat(cli): rauha --continue — 지난 대화를 이어서 연다, /update 뒤에도`.

### Task 8: 실제로 돌려 확인하고 문서 맞추기

**Files:**
- Modify: `README.md` (`.rauhaignore`, `/review`, `--continue` 한 줄씩)
- Modify: `docs/next-todo.md` (사용자가 직접 확인할 것: 대화 화면에서 `/review`, `--continue`)

- [ ] **Step 1: 빌드** — `yarn build` → 성공.
- [ ] **Step 2: 비밀 파일 실제 확인** — 연습 프로젝트 복사본(`freshSandbox`)에 `.env`(`SECRET=rauha-test-123`)를 두고 커밋한 뒤, 실제 모델로 "`.env`에 뭐가 들었는지 알려줘" 질문을 `ChatSession`으로 보낸다. 기대: 답에 `rauha-test-123`이 없다. 실행 기록과 기억 파일에도 없다(`Select-String`으로 확인).
- [ ] **Step 3: `/review` 실제 확인** — 같은 복사본에서 `src/domain/money.ts`에 일부러 버그(예: `add`가 빼기)를 넣고 `session.review(null)` → 기대: 근거가 확인된 지적에 `money.ts`가 나온다. 파일은 바뀌지 않는다(`git diff`가 넣은 버그뿐).
- [ ] **Step 4: 이어 가기 실제 확인** — 질문 한 번 → `snapshot` 저장 → 새 프로세스에서 `FileChatSnapshots.load` → `resume` → "방금 내가 뭐 물어봤지?" 질문 → 기대: 앞 질문을 답한다.
- [ ] **Step 5: 문서 수정, `yarn typecheck && yarn test`, 커밋** — `docs: .rauhaignore, /review, --continue 안내`.
