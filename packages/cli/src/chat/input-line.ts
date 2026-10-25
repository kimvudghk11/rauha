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
