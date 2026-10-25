# 2단계 C2: 대화 모드 화면(Ink) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `rauha`(인자 없음)로 Claude Code 같은 대화 화면을 연다: 맨 위 Delfi 시작 박스, 지나간 대화(고정 출력), 일하는 중 스피너, 허락·해석·추측·지난 작업 고르기 목록, 아래 입력창. 창 크기를 바꾸면 다시 그린다.

**Architecture:** 화면 상태는 순수 TS 저장소(`ChatStore`)가 들고, Ink 부품(`ChatApp`)은 그것을 그리기만 한다. 세션(`ChatSession`, C1)의 허락·확인 질문은 `ChatStore.ask()`가 돌려주는 Promise로 이어진다. 입력 편집과 명령 해석은 순수 함수.

**Tech Stack:** ink@5.2.1, react@18.3.1(JSX 없이 `React.createElement`), ink-testing-library@4.0.0, vitest

**Spec:** `docs/superpowers/specs/2026-10-25-step2-ladder-facts-chat-design.md` 5.1, 5.3

## Global Constraints

- cmd 한글 글꼴 제약: 박스 테두리는 1/8 블록(▁▔▕▏), 박스 안에 폭이 애매한 글자 금지, 스피너는 사분면 블록, 줄 마지막 칸 배경색 금지.
- Delfi와 하늘색 계열 유지. 화면이 없으면(파이프) 대화 모드를 열지 않고 안내만 한다.
- 명령: `/clear`, `/status`, `/usage`, `/help`, `/exit` (Ctrl+C 두 번도 종료).
- 규칙 변경은 실패하는 `*.spec.ts`부터. 작업마다 커밋하고 `main`에 push.

## Review Focus

- 팀원이 동시에 허락을 두 번 물어도 질문은 한 번에 하나씩 뜬다 → Task 2 테스트.
- 일하는 중(busy)에는 입력창이 새 요청을 받지 않는다 → Task 3 테스트.
- 알 수 없는 `/명령`은 요청으로 보내지 않고 안내한다 → Task 1 테스트.
- 한글 입력(여러 글자가 한 번에 들어옴)과 지우기가 글자 단위로 된다 → Task 1 테스트.
- 세션 오류(예외)가 화면을 죽이지 않고 한 줄로 보이고 다시 입력을 받는다 → Task 4에서 확인.

---

### Task 1: 입력 편집과 명령 해석 (순수)

**Files:** Create `packages/cli/src/chat/input-line.ts`, `packages/cli/src/chat/commands.ts` (+ spec)

**Interfaces:**
- `export interface InputState { readonly text: string; readonly cursor: number }` (cursor = 글자 단위 위치)
- `export function editInput(state: InputState, input: string, key: Key): { state: InputState; submit: string | null }` — 글자 입력(여러 글자 한 번에), ←→, Home/End, Backspace/Delete, Ctrl+U(모두 지움), Enter(앞뒤 공백 뺀 글이 있으면 submit하고 비움).
- `export type ChatCommand = { kind: 'clear' | 'status' | 'usage' | 'help' | 'exit' } | { kind: 'unknown'; name: string }`; `export function parseCommand(text: string): ChatCommand | null` (`/`로 시작하지 않으면 null).
- [ ] 실패하는 테스트 → 확인 → 구현 → 통과 → 커밋 `feat(cli): 대화 입력 편집과 명령 해석`

### Task 2: ChatStore — 화면 상태와 질문 줄 세우기 (순수)

**Files:** Create `packages/cli/src/chat/chat-store.ts` (+ spec)

**Interfaces:**
- `ChatStore`: `lines: readonly string[]`(고정 출력), `working: { text: string; role: MemberRole; startedAt: number } | null`, `prompt: Prompt | null`, `busy: boolean`; `print(text)`, `startWorking(text, role, now)`, `stopWorking(finalLine | null)`, `setBusy(b)`, `subscribe(fn): () => void`.
- `type Prompt = { kind: 'menu'; screen: string; options: readonly string[] } | { kind: 'text'; label: string }`; `ask(prompt: Prompt): Promise<number | string>` — 메뉴는 고른 번호(-1 = Esc), 글은 입력한 문자열. 앞 질문이 끝나야 다음 질문이 뜬다. `answer(value)`로 지금 질문에 답한다.
- [ ] 테스트: `'질문은 한 번에 하나씩 뜨고 답하면 다음 질문이 뜬다'`, `'출력과 상태가 바뀌면 구독자에게 알린다'`, `'일이 끝나면 일하는 중 표시를 고정 줄로 바꾼다'` → 구현 → 커밋 `feat(cli): 대화 화면 상태 저장소`

### Task 3: ChatApp — Ink 화면

**Files:** Create `packages/cli/src/chat/chat-app.ts` (+ spec, ink-testing-library)

**Interfaces:** `ChatApp({ store, banner, view, onSubmit })` — `Static`으로 배너와 고정 줄, 그 아래 일하는 중 줄(LiveLine과 같은 사분면 스피너·경과 시간), 질문(메뉴는 `menuLines`와 `menuKey` 재사용, 글 질문은 한 줄 입력), 입력창(블록 테두리 박스 안 `> ` + 글, busy면 흐린 안내 "팀원이 일하는 중이에요").
- [ ] 테스트: `'처음에는 배너와 입력창을 그린다'`, `'글을 치고 Enter를 누르면 onSubmit으로 보낸다'`, `'일하는 중에는 입력을 받지 않는다'`, `'메뉴 질문이 뜨면 아래 화살표와 Enter로 고른다'` → 구현 → 커밋 `feat(cli): 대화 모드 Ink 화면`

### Task 4: 대화 모드 연결

**Files:** Create `packages/cli/src/chat/run-chat.ts`; Modify `packages/cli/src/main.ts`, `packages/cli/src/run.ts`(최소 루프 조립을 함수로 빼서 세션과 -p가 같이 씀)

- 연결: `ChatSession`(newLoop = carried를 받아 `MinimalLoopService` 조립), 기억 `openMemory`, 허락(`toPermissionAnswer` + 메뉴/글 질문), 해석 고르기(메뉴), 추측 확인(`toFactAnswer`), 지난 작업 고르기(메뉴 + "아니요, 새 작업이에요"), 진행 알림 → `startWorking/stopWorking/print`.
- 결과 출력: 작업 → 끝 표정 + 안내서(`toTerminal`), 답 → 답 글 + "근거 확인됨 n개" + 추측 목록, 한도 → 한도 문장. 예외는 `rauha: <메시지>` 한 줄로 찍고 계속.
- 명령: `/clear`(세션 대화 비움, "대화를 비웠어요. 기억은 남아 있어요"), `/status`, `/usage`, `/help`, `/exit`.
- 화면이 없으면 "대화 모드는 터미널에서만 열 수 있어요. rauha -p \"<요청>\"을 쓰세요."
- [ ] `yarn typecheck && yarn test`, `yarn build`, cmd 창에서 띄워 캡처로 배너·입력창·창 크기 변경 확인 → 커밋 `feat(cli): rauha 대화 모드` 후 push
