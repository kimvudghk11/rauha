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
    const text = state.text.trim();
    return text === '' ? keep(state) : { state: EMPTY, submit: text };
  }
  if (key.ctrl && input === 'u') return keep(EMPTY);
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
  const typed = [...input.replace(/[\r\n]/g, '')];
  return keep({ text: [...chars.slice(0, at), ...typed, ...chars.slice(at)].join(''), cursor: at + typed.length });
}

/** 입력창에 그릴 줄들과 커서 자리(줄 번호, 그 줄 앞에서부터 칸 수). */
export interface InputLayout {
  readonly lines: readonly string[];
  readonly row: number;
  readonly column: number;
}

/**
 * 입력 글을 width 칸으로 접고 커서 자리를 계산한다. 진짜 터미널 커서를 이 자리에 두어야
 * 한글 입력기가 조합 중인 글자를 입력창 안에 그린다.
 */
export function inputLayout(state: InputState, width: number): InputLayout {
  const lines = wrapText(state.text, width);
  const at = Math.min(state.cursor, [...state.text].length);
  let before = 0;
  for (let row = 0; row < lines.length; row++) {
    const chars = [...lines[row]!];
    const last = row === lines.length - 1;
    if (at < before + chars.length || (last && at === before + chars.length)) {
      const column = displayWidth(chars.slice(0, at - before).join(''));
      // 꽉 찬 줄 끝의 커서는 그 줄에 둘 칸이 없어서 다음 빈 줄로 보낸다.
      if (column >= width) return { lines: [...lines, ''], row: row + 1, column: 0 };
      return { lines, row, column };
    }
    before += chars.length;
  }
  return { lines, row: lines.length - 1, column: 0 };
}
