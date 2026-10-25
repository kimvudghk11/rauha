import { Box, Static, Text, useInput, useStdout } from 'ink';
import React, { useEffect, useReducer, useState } from 'react';
import { formatElapsed } from '../live-line.js';
import type { MascotView } from '../mascot.js';
import { menuKey, menuLines } from '../menu.js';
import { displayWidth, fitLines } from '../text-width.js';
import type { CursorPark, CursorSpot } from './cursor-park.js';
import type { ChatStore, Prompt, Working } from './chat-store.js';
import { editInput, inputLayout, type InputState } from './input-line.js';

const h = React.createElement;

/** 사분면 블록 스피너. 한글 글꼴 cmd에서도 한 칸으로 그려진다(-p의 LiveLine과 같다). */
const SPINNER = ['▖', '▘', '▝', '▗'] as const;

/** 1/8 블록 테두리. 선 문자(╭─╮)는 한글 글꼴 cmd에서 가로선이 사라질 때가 있다. */
const BLOCK_BORDER = { topLeft: ' ', top: '▁', topRight: ' ', left: '▕', right: '▏', bottomLeft: ' ', bottom: '▔', bottomRight: ' ' };
const SKY = '#8FD3F7';
/** 입력창 최대 너비. 창 너비를 다 쓰면 창을 조금만 줄여도 cmd가 줄을 접어 지난 테두리가 남는다. */
const MAX_INPUT_WIDTH = 76;

/** 창 크기를 바꾸는 동안 여러 번 오는 resize를 모아, 멈춘 뒤 한 번만 다시 그린다. */
const REDRAW_DELAY_MS = 150;
/** 화면과 스크롤을 지우고 커서를 맨 위로. 접혀서 깨진 지난 출력을 남기지 않는다(Claude Code도 이렇게 한다). */
const CLEAR_ALL = '\x1b[2J\x1b[3J\x1b[H';

export interface ChatAppProps {
  readonly store: ChatStore;
  /** 맨 위 시작 박스. 창 너비가 바뀌면 새 너비로 다시 만든다. */
  readonly banner: (columns: number) => string;
  readonly view: MascotView | null;
  readonly onSubmit: (text: string) => void;
  /** 진짜 터미널 커서를 입력 자리로 옮기는 곳. 없으면 반전 글자로 커서를 흉내 낸다. */
  readonly cursor?: CursorPark;
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

/** 진짜 커서를 spot에 둔다. 화면에서 사라지면 치운다. */
function useParkedCursor(cursor: CursorPark | null, spot: CursorSpot | null): void {
  useEffect(() => {
    cursor?.set(spot);
  }, [cursor, spot?.up, spot?.column]);
  useEffect(() => () => cursor?.set(null), [cursor]);
}

function TextPrompt({ store, prompt, cursor }: { store: ChatStore; prompt: Extract<Prompt, { kind: 'text' }>; cursor: CursorPark | null }) {
  const [state, setState] = useState<InputState>({ text: '', cursor: 0 });
  useInput((input, key) => {
    if (key.return) {
      store.answer(state.text.trim());
      return;
    }
    setState(editInput(state, input, key).state);
  });
  const label = `  ${prompt.label}: `;
  const before = [...state.text].slice(0, state.cursor).join('');
  useParkedCursor(cursor, { up: 1, column: displayWidth(label) + displayWidth(before) });
  return h(Box, null, h(Text, { color: SKY }, label), cursor !== null ? h(Text, null, state.text) : withCursor(state));
}

function InputBox({ busy, onSubmit, cursor }: { busy: boolean; onSubmit: (text: string) => void; cursor: CursorPark | null }) {
  const [state, setState] = useState<InputState>({ text: '', cursor: 0 });
  const { stdout } = useStdout();
  const width = Math.min((stdout.columns || 80) - 1, MAX_INPUT_WIDTH);
  useInput(
    (input, key) => {
      const result = editInput(state, input, key);
      setState(result.state);
      if (result.submit !== null) onSubmit(result.submit);
    },
    { isActive: !busy },
  );
  // 테두리 두 칸, 여백 두 칸, '> ' 두 칸을 빼고 접는다. Ink가 따로 접지 않게 미리 접어야 커서 자리를 안다.
  const layout = inputLayout(state, width - 6);
  // 입력 줄 아래에 아래 테두리가 있고, Ink는 그린 뒤 커서를 그다음 줄에 둔다.
  useParkedCursor(cursor, busy ? null : { up: layout.lines.length - layout.row + 1, column: 4 + layout.column });
  const offset = state.cursor - layout.lines.slice(0, layout.row).reduce((sum, l) => sum + [...l].length, 0);
  const line = (text: string, row: number) =>
    h(
      Box,
      { key: row },
      h(Text, { color: SKY }, row === 0 ? '> ' : '  '),
      cursor === null && row === layout.row ? withCursor({ text, cursor: offset }) : h(Text, null, text),
    );
  return h(
    Box,
    { borderStyle: BLOCK_BORDER, borderColor: SKY, paddingX: 1, marginTop: 1, width, flexDirection: 'column' },
    busy ? h(Text, { dimColor: true }, '팀원이 일하는 중이에요… (끝나면 다시 입력할 수 있어요)') : layout.lines.map(line),
  );
}

interface Screen {
  /** 다시 그린 횟수. 바뀌면 Static을 새로 올려 지난 출력을 처음부터 다시 찍는다. */
  readonly redraws: number;
  readonly columns: number;
  readonly rows: number;
}

/** 창 크기가 바뀌고 잠잠해지면 화면을 지우고 다시 그리게 한다. 접힌 지난 줄은 지우는 것 말고 고칠 길이 없다. */
function useScreen(): Screen {
  const { stdout, write } = useStdout();
  const size = () => ({ columns: stdout.columns || 80, rows: stdout.rows || 0 });
  const [screen, setScreen] = useState<Screen>({ redraws: 0, ...size() });
  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        write(CLEAR_ALL);
        setScreen((s) => ({ redraws: s.redraws + 1, ...size() }));
      }, REDRAW_DELAY_MS);
    };
    stdout.on('resize', onResize);
    return () => {
      clearTimeout(timer);
      stdout.off('resize', onResize);
    };
  }, [stdout]);
  return screen;
}

/**
 * 대화 모드 화면. 지나간 출력은 Static으로 한 번만 그리고(스크롤로 남음), 아래쪽(일하는 중, 질문, 입력창)만
 * 다시 그린다. Claude Code처럼 입력창은 화면 맨 아래에 붙인다: 지난 출력이 화면을 다 채우기 전에는
 * 그 사이를 빈 줄로 채운다. 그러려면 지난 출력이 몇 줄인지 알아야 해서, 고정 줄은 미리 창 너비로 접어 둔다.
 */
export function ChatApp({ store, banner, view, onSubmit, cursor }: ChatAppProps) {
  useStore(store);
  const screen = useScreen();
  const prompt = store.prompt;
  // 마지막 칸까지 채운 줄은 터미널이 한 번 더 접어서 한 칸을 비운다. 빈 줄은 ' '로(빈 글은 높이가 0).
  const lines = [banner(screen.columns), ...store.lines].flatMap((item) => fitLines(item, screen.columns - 1)).map((line) => line || ' ');
  // 그린 뒤 커서가 한 줄 더 내려가므로 화면 높이보다 한 줄 적게 채운다.
  const fill = Math.max(0, screen.rows - 1 - lines.length);
  return h(
    Box,
    { flexDirection: 'column' },
    h(Static<string>, { key: screen.redraws, items: lines, children: (line: string, i: number) => h(Text, { key: i }, line) }),
    h(
      Box,
      { flexDirection: 'column', justifyContent: 'flex-end', minHeight: fill },
      store.working !== null ? h(WorkingLine, { working: store.working, view }) : null,
      prompt?.kind === 'menu' ? h(MenuPrompt, { key: prompt.screen, store, prompt, view }) : null,
      prompt?.kind === 'text' ? h(TextPrompt, { key: prompt.label, store, prompt, cursor: cursor ?? null }) : null,
      prompt === null ? h(InputBox, { busy: store.busy, onSubmit, cursor: cursor ?? null }) : null,
    ),
  );
}
