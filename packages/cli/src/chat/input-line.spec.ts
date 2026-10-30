import { describe, expect, it } from 'vitest';
import { editInput, inputLayout, moveVertical, type InputState } from './input-line.js';

const empty: InputState = { text: '', cursor: 0 };
const type = (state: InputState, input: string) => editInput(state, input, {}).state;

describe('editInput', () => {
  it('한글처럼 여러 글자가 한 번에 들어와도 커서 위치에 넣는다', () => {
    expect(type(empty, '할인')).toEqual({ text: '할인', cursor: 2 });
    expect(type({ text: '할인', cursor: 0 }, 'Money ')).toEqual({ text: 'Money 할인', cursor: 6 });
  });

  it('지우기는 글자 단위다', () => {
    expect(editInput({ text: '할인', cursor: 2 }, '', { backspace: true }).state).toEqual({ text: '할', cursor: 1 });
    expect(editInput({ text: '할인', cursor: 0 }, '', { delete: true }).state).toEqual({ text: '인', cursor: 0 });
    expect(editInput(empty, '', { backspace: true }).state).toEqual(empty);
  });

  it('좌우 화살표와 Ctrl+U', () => {
    expect(editInput({ text: 'ab', cursor: 2 }, '', { leftArrow: true }).state.cursor).toBe(1);
    expect(editInput({ text: 'ab', cursor: 2 }, '', { rightArrow: true }).state.cursor).toBe(2);
    expect(editInput({ text: 'ab', cursor: 1 }, 'u', { ctrl: true }).state).toEqual(empty);
  });

  it('Enter는 앞뒤 공백을 뺀 글을 보내고 입력을 비운다. 빈 글은 보내지 않는다', () => {
    expect(editInput({ text: '  고쳐줘 ', cursor: 5 }, '', { return: true })).toEqual({ state: empty, submit: '고쳐줘' });
    expect(editInput({ text: '   ', cursor: 3 }, '', { return: true }).submit).toBeNull();
  });

  it('Ctrl이나 Esc 같은 조합은 글로 넣지 않는다', () => {
    expect(editInput(empty, 'c', { ctrl: true }).state).toEqual(empty);
    expect(editInput(empty, '', { escape: true }).state).toEqual(empty);
  });
});

describe('inputLayout', () => {
  it('짧은 글은 한 줄, 커서는 앞 글자들의 칸 수만큼 뒤에 있다 (한글은 두 칸)', () => {
    expect(inputLayout({ text: '가a', cursor: 2 }, 10)).toMatchObject({ lines: ['가a'], row: 0, column: 3 });
    expect(inputLayout({ text: '가a', cursor: 1 }, 10)).toMatchObject({ lines: ['가a'], row: 0, column: 2 });
  });

  it('입력창보다 긴 글은 줄을 바꿔 모두 보여 주고, 커서가 있는 줄을 알려 준다', () => {
    expect(inputLayout({ text: 'abcdefg', cursor: 6 }, 4)).toMatchObject({ lines: ['abcd', 'efg'], row: 1, column: 2 });
  });

  it('줄을 꽉 채운 뒤 끝에 있는 커서는 다음 빈 줄 맨 앞에 둔다', () => {
    expect(inputLayout({ text: 'abcd', cursor: 4 }, 4)).toMatchObject({ lines: ['abcd', ''], row: 1, column: 0 });
    expect(inputLayout({ text: 'abcdef', cursor: 4 }, 4)).toMatchObject({ lines: ['abcd', 'ef'], row: 1, column: 0 });
  });

  it('빈 입력은 빈 한 줄', () => {
    expect(inputLayout({ text: '', cursor: 0 }, 4)).toMatchObject({ lines: [''], row: 0, column: 0 });
  });
});

describe('editInput — 편집 단축키', () => {
  const ctrl = (state: InputState, input: string) => editInput(state, input, { ctrl: true }).state;

  it('Ctrl+A는 맨 앞, Ctrl+E는 맨 끝으로 간다', () => {
    expect(ctrl({ text: '할인 넣어줘', cursor: 3 }, 'a').cursor).toBe(0);
    expect(ctrl({ text: '할인 넣어줘', cursor: 3 }, 'e').cursor).toBe(6);
  });

  it('Ctrl+W는 커서 앞 한 단어를 지운다', () => {
    expect(ctrl({ text: 'Money 할인 넣어줘', cursor: 9 }, 'w')).toEqual({ text: 'Money 넣어줘', cursor: 6 });
    expect(ctrl({ text: 'Money  ', cursor: 7 }, 'w')).toEqual({ text: '', cursor: 0 });
  });

  it('Ctrl+K는 커서부터 끝까지 지운다', () => {
    expect(ctrl({ text: 'Money 할인', cursor: 5 }, 'k')).toEqual({ text: 'Money', cursor: 5 });
  });
});

describe('editInput — 여러 줄', () => {
  const enter = (state: InputState, key: Parameters<typeof editInput>[2] = {}) => editInput(state, '', { return: true, ...key });

  it('줄 끝 백슬래시 뒤의 Enter는 보내지 않고 줄바꿈으로 바꾼다', () => {
    expect(enter({ text: '첫 줄\\', cursor: 4 })).toEqual({ state: { text: '첫 줄\n', cursor: 4 }, submit: null });
  });

  it('Alt+Enter와 Ctrl+J도 줄바꿈이다', () => {
    expect(enter({ text: '가나', cursor: 1 }, { meta: true })).toEqual({ state: { text: '가\n나', cursor: 2 }, submit: null });
    expect(editInput({ text: '가', cursor: 1 }, 'j', { ctrl: true }).state).toEqual({ text: '가\n', cursor: 2 });
  });

  it('붙여넣은 여러 줄 글은 보내지 않고 줄바꿈을 지킨 채 넣는다 (CRLF·CR도 한 줄바꿈)', () => {
    expect(type(empty, '가\r\n나\r다')).toEqual({ text: '가\n나\n다', cursor: 5 });
  });

  it('줄바꿈이 든 글도 Enter로 보내고 앞뒤 공백만 다듬는다', () => {
    expect(enter({ text: '가\n나 ', cursor: 4 })).toEqual({ state: { text: '', cursor: 0 }, submit: '가\n나' });
  });
});

describe('inputLayout — 여러 줄', () => {
  it('줄바꿈마다 줄을 나누고, 커서는 줄바꿈 글자도 한 자리로 센다', () => {
    expect(inputLayout({ text: '가\nabc', cursor: 3 }, 10)).toEqual({ lines: ['가', 'abc'], row: 1, column: 1, offset: 1, starts: [0, 2] });
    expect(inputLayout({ text: '가\nabc', cursor: 1 }, 10)).toMatchObject({ row: 0, column: 2, offset: 1 });
  });

  it('줄바꿈 바로 뒤의 빈 줄에도 커서를 둘 수 있다', () => {
    expect(inputLayout({ text: '가\n', cursor: 2 }, 10)).toMatchObject({ lines: ['가', ''], row: 1, column: 0 });
  });

  it('긴 줄은 접고 그 아래 줄은 그대로 이어진다', () => {
    expect(inputLayout({ text: 'abcdef\nxy', cursor: 9 }, 4)).toMatchObject({ lines: ['abcd', 'ef', 'xy'], row: 2, column: 2 });
  });
});

describe('moveVertical', () => {
  const at = (text: string, cursor: number, width = 10) => inputLayout({ text, cursor }, width);

  it('위·아래 줄의 같은 칸으로 커서를 옮긴다', () => {
    const state = { text: 'abcd\nxy\nmnop', cursor: 12 };
    expect(moveVertical(state, at(state.text, 12), -1)!.cursor).toBe(7);
    expect(moveVertical({ ...state, cursor: 3 }, at(state.text, 3), 1)!.cursor).toBe(7);
    expect(moveVertical({ ...state, cursor: 1 }, at(state.text, 1), 1)!.cursor).toBe(6);
  });

  it('맨 위·맨 아래 줄에서는 움직일 곳이 없다', () => {
    const state = { text: 'a\nb', cursor: 0 };
    expect(moveVertical(state, at(state.text, 0), -1)).toBeNull();
    expect(moveVertical({ ...state, cursor: 3 }, at(state.text, 3), 1)).toBeNull();
  });
});
