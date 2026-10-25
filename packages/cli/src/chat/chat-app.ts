import { Box, Static, Text, useInput, useStdout } from 'ink';
import React, { useEffect, useReducer, useState } from 'react';
import { formatElapsed } from '../live-line.js';
import type { MascotView } from '../mascot.js';
import { menuKey, menuLines } from '../menu.js';
import type { ChatStore, Prompt, Working } from './chat-store.js';
import { editInput, type InputState } from './input-line.js';

const h = React.createElement;

/** 사분면 블록 스피너. 한글 글꼴 cmd에서도 한 칸으로 그려진다(-p의 LiveLine과 같다). */
const SPINNER = ['▖', '▘', '▝', '▗'] as const;

/** 1/8 블록 테두리. 선 문자(╭─╮)는 한글 글꼴 cmd에서 가로선이 사라질 때가 있다. */
const BLOCK_BORDER = { topLeft: ' ', top: '▁', topRight: ' ', left: '▕', right: '▏', bottomLeft: ' ', bottom: '▔', bottomRight: ' ' };
const SKY = '#8FD3F7';
/** 입력창 최대 너비. 창 너비를 다 쓰면 창을 조금만 줄여도 cmd가 줄을 접어 지난 테두리가 남는다. */
const MAX_INPUT_WIDTH = 76;

export interface ChatAppProps {
  readonly store: ChatStore;
  /** 맨 위에 한 번 그리는 시작 박스 */
  readonly banner: string;
  readonly view: MascotView | null;
  readonly onSubmit: (text: string) => void;
}

function useStore(store: ChatStore): void {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => store.subscribe(rerender), [store]);
}

/** 입력 글과 커서. 커서 자리 글자를 반전해 보여 준다. */
function withCursor(state: InputState): React.ReactNode {
  const chars = [...state.text];
  const at = Math.min(state.cursor, chars.length);
  return h(Text, null, chars.slice(0, at).join(''), h(Text, { inverse: true }, chars[at] ?? ' '), chars.slice(at + 1).join(''));
}

function WorkingLine({ working, view }: { working: Working; view: MascotView | null }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => f + 1), 120);
    return () => clearInterval(timer);
  }, []);
  const spinner = SPINNER[frame % SPINNER.length]!;
  const elapsed = formatElapsed(Date.now() - working.startedAt);
  return h(Text, null, view?.working(spinner, working.text, working.role, elapsed) ?? `  ${spinner} ${working.text} ${elapsed}`);
}

function MenuPrompt({ store, prompt, view }: { store: ChatStore; prompt: Extract<Prompt, { kind: 'menu' }>; view: MascotView | null }) {
  const [index, setIndex] = useState(0);
  useInput((input, key) => {
    const next = menuKey(index, { name: key.upArrow ? 'up' : key.downArrow ? 'down' : key.return ? 'return' : key.escape ? 'escape' : input, sequence: input, ctrl: key.ctrl }, prompt.options.length);
    if (next.index >= 0 && next.index !== index) setIndex(next.index);
    if (next.done) store.answer(next.index);
  });
  return h(
    Box,
    { flexDirection: 'column', marginTop: 1 },
    h(Text, null, prompt.screen),
    h(Text, null, ' '),
    ...menuLines(prompt.options, index, view?.highlight).map((line, i) => h(Text, { key: i }, line)),
  );
}

function TextPrompt({ store, prompt }: { store: ChatStore; prompt: Extract<Prompt, { kind: 'text' }> }) {
  const [state, setState] = useState<InputState>({ text: '', cursor: 0 });
  useInput((input, key) => {
    if (key.return) {
      store.answer(state.text.trim());
      return;
    }
    setState(editInput(state, input, key).state);
  });
  return h(Box, null, h(Text, { color: SKY }, `  ${prompt.label}: `), withCursor(state));
}

function InputBox({ busy, onSubmit }: { busy: boolean; onSubmit: (text: string) => void }) {
  const [state, setState] = useState<InputState>({ text: '', cursor: 0 });
  const { stdout } = useStdout();
  const width = Math.min(stdout.columns ?? 80, MAX_INPUT_WIDTH);
  useInput(
    (input, key) => {
      const result = editInput(state, input, key);
      setState(result.state);
      if (result.submit !== null) onSubmit(result.submit);
    },
    { isActive: !busy },
  );
  return h(
    Box,
    { borderStyle: BLOCK_BORDER, borderColor: SKY, paddingX: 1, marginTop: 1, width },
    busy ? h(Text, { dimColor: true }, '팀원이 일하는 중이에요… (끝나면 다시 입력할 수 있어요)') : h(Box, null, h(Text, { color: SKY }, '> '), withCursor(state)),
  );
}

/**
 * 대화 모드 화면. 지나간 출력은 Static으로 한 번만 그리고(스크롤로 남음), 아래쪽(일하는 중, 질문, 입력창)만
 * 다시 그린다. 창 크기가 바뀌면 Ink가 아래쪽을 새 너비로 다시 그린다.
 */
export function ChatApp({ store, banner, view, onSubmit }: ChatAppProps) {
  useStore(store);
  const prompt = store.prompt;
  const items = [banner, ...store.lines];
  return h(
    Box,
    { flexDirection: 'column' },
    h(Static<string>, { items, children: (line: string, i: number) => h(Text, { key: i }, line) }),
    store.working !== null ? h(WorkingLine, { working: store.working, view }) : null,
    prompt?.kind === 'menu' ? h(MenuPrompt, { key: prompt.screen, store, prompt, view }) : null,
    prompt?.kind === 'text' ? h(TextPrompt, { key: prompt.label, store, prompt }) : null,
    prompt === null ? h(InputBox, { busy: store.busy, onSubmit }) : null,
  );
}
