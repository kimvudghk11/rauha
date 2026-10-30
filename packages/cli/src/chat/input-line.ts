import { displayWidth, wrapText } from '../text-width.js';

/** Ink useInput이 주는 키 정보 중 입력창이 쓰는 것 */
export interface InputKey {
  readonly leftArrow?: boolean;
  readonly rightArrow?: boolean;
  readonly upArrow?: boolean;
  readonly downArrow?: boolean;
  readonly return?: boolean;
  readonly escape?: boolean;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
  readonly tab?: boolean;
  readonly backspace?: boolean;
  readonly delete?: boolean;
  readonly home?: boolean;
  readonly end?: boolean;
}

/** cursor는 글자(코드 포인트) 단위 위치 */
export interface InputState {
  readonly text: string;
  readonly cursor: number;
}

const EMPTY: InputState = { text: '', cursor: 0 };

/**
 * 입력창 한 번의 키 처리. 한글 입력기는 완성된 글자를 여러 개 한 번에 보내기도 해서 문자열째 넣는다.
 * 터미널에 따라 Backspace가 delete로 오므로, 맨 끝에서 온 delete는 앞 글자를 지운다.
 */
export function editInput(state: InputState, input: string, key: InputKey): { state: InputState; submit: string | null } {
  const chars = [...state.text];
  const at = Math.min(state.cursor, chars.length);
  const keep = (next: InputState) => ({ state: next, submit: null });

  if (key.return) {
    // Alt+Enter, 또는 줄 끝 \ 뒤의 Enter는 보내지 않고 줄바꿈을 넣는다(Claude Code처럼).
    if (key.meta) return keep({ text: [...chars.slice(0, at), '\n', ...chars.slice(at)].join(''), cursor: at + 1 });
    if (chars[at - 1] === '\\') return keep({ text: [...chars.slice(0, at - 1), '\n', ...chars.slice(at)].join(''), cursor: at });
    const text = state.text.trim();
    return text === '' ? keep(state) : { state: EMPTY, submit: text };
  }
  if (key.ctrl && input === 'u') return keep(EMPTY);
  if (key.ctrl && input === 'j') return keep({ text: [...chars.slice(0, at), '\n', ...chars.slice(at)].join(''), cursor: at + 1 });
  if (key.ctrl && input === 'a') return keep({ text: state.text, cursor: 0 });
  if (key.ctrl && input === 'e') return keep({ text: state.text, cursor: chars.length });
  if (key.ctrl && input === 'k') return keep({ text: chars.slice(0, at).join(''), cursor: at });
  if (key.ctrl && input === 'w') {
    // 커서 앞의 띄어쓰기를 건너뛰고, 그 앞 한 단어를 지운다.
    let start = at;
    while (start > 0 && chars[start - 1] === ' ') start -= 1;
    while (start > 0 && chars[start - 1] !== ' ') start -= 1;
    return keep({ text: [...chars.slice(0, start), ...chars.slice(at)].join(''), cursor: start });
  }
  if (key.leftArrow) return keep({ text: state.text, cursor: Math.max(0, at - 1) });
  if (key.rightArrow) return keep({ text: state.text, cursor: Math.min(chars.length, at + 1) });
  if (key.home) return keep({ text: state.text, cursor: 0 });
  if (key.end) return keep({ text: state.text, cursor: chars.length });
  if (key.backspace || (key.delete && at === chars.length)) {
    if (at === 0) return keep(state);
    return keep({ text: [...chars.slice(0, at - 1), ...chars.slice(at)].join(''), cursor: at - 1 });
  }
  if (key.delete) return keep({ text: [...chars.slice(0, at), ...chars.slice(at + 1)].join(''), cursor: at });
  if (key.ctrl || key.meta || key.escape || key.tab || key.upArrow || key.downArrow || input === '') return keep(state);
  // 붙여넣은 여러 줄 글은 보내지 않고 줄바꿈을 지킨 채 넣는다.
  const typed = [...input.replace(/\r\n?/g, '\n')];
  return keep({ text: [...chars.slice(0, at), ...typed, ...chars.slice(at)].join(''), cursor: at + typed.length });
}

/** 입력창에 그릴 줄들과 커서 자리. offset: 커서가 있는 줄 안에서 앞 글자 수, starts: 줄마다 첫 글자의 글 전체 안 자리. */
export interface InputLayout {
  readonly lines: readonly string[];
  readonly row: number;
  readonly column: number;
  readonly offset: number;
  readonly starts: readonly number[];
}

/**
 * 입력 글을 줄바꿈으로 나누고 각 줄을 width 칸으로 접어 커서 자리를 계산한다. 진짜 터미널 커서를 이 자리에 두어야
 * 한글 입력기가 조합 중인 글자를 입력창 안에 그린다. 줄바꿈 글자도 커서 자리 하나를 차지한다.
 */
export function inputLayout(state: InputState, width: number): InputLayout {
  const at = Math.min(state.cursor, [...state.text].length);
  const lines: string[] = [];
  const starts: number[] = [];
  let row = 0;
  let column = 0;
  let offset = 0;
  let base = 0;
  const parts = state.text.split('\n');
  parts.forEach((part, p) => {
    const rows = wrapText(part, width);
    let before = base;
    rows.forEach((text, r) => {
      const chars = [...text];
      const lastRow = r === rows.length - 1;
      lines.push(text);
      starts.push(before);
      if (at >= before && (at < before + chars.length || (lastRow && at === before + chars.length))) {
        row = lines.length - 1;
        offset = at - before;
        column = displayWidth(chars.slice(0, offset).join(''));
        if (column >= width) {
          // 꽉 찬 줄 끝의 커서는 그 줄에 둘 칸이 없다. 글 맨 끝이면 다음 빈 줄로 보내고, 아니면 마지막 칸에 겹친다.
          if (p === parts.length - 1 && lastRow) {
            lines.push('');
            starts.push(at);
            row = lines.length - 1;
            column = 0;
            offset = 0;
          } else {
            column = width - 1;
          }
        }
      }
      before += chars.length;
    });
    base += [...part].length + 1;
  });
  return { lines, row, column, offset, starts };
}

/** 커서를 위(-1)·아래(1) 줄의 같은 칸으로 옮긴다. 움직일 줄이 없으면 null. */
export function moveVertical(state: InputState, layout: InputLayout, delta: -1 | 1): InputState | null {
  const target = layout.row + delta;
  if (target < 0 || target >= layout.lines.length) return null;
  const chars = [...layout.lines[target]!];
  // 접힌 줄의 끝은 다음 줄의 첫 자리와 같아서, 줄바꿈으로 끝나지 않은 줄은 마지막 글자 앞까지만 간다.
  const endsParagraph = target === layout.lines.length - 1 || layout.starts[target + 1]! > layout.starts[target]! + chars.length;
  const limit = endsParagraph ? chars.length : Math.max(0, chars.length - 1);
  let width = 0;
  let i = 0;
  while (i < limit && width + displayWidth(chars[i]!) <= layout.column) {
    width += displayWidth(chars[i]!);
    i += 1;
  }
  return { text: state.text, cursor: layout.starts[target]! + i };
}
