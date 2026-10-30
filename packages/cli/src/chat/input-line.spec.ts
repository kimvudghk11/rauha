import { describe, expect, it } from 'vitest';
import { editInput, inputLayout, type InputState } from './input-line.js';

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
    expect(inputLayout({ text: '가a', cursor: 2 }, 10)).toEqual({ lines: ['가a'], row: 0, column: 3 });
    expect(inputLayout({ text: '가a', cursor: 1 }, 10)).toEqual({ lines: ['가a'], row: 0, column: 2 });
  });

  it('입력창보다 긴 글은 줄을 바꿔 모두 보여 주고, 커서가 있는 줄을 알려 준다', () => {
    expect(inputLayout({ text: 'abcdefg', cursor: 6 }, 4)).toEqual({ lines: ['abcd', 'efg'], row: 1, column: 2 });
  });

  it('줄을 꽉 채운 뒤 끝에 있는 커서는 다음 빈 줄 맨 앞에 둔다', () => {
    expect(inputLayout({ text: 'abcd', cursor: 4 }, 4)).toEqual({ lines: ['abcd', ''], row: 1, column: 0 });
    expect(inputLayout({ text: 'abcdef', cursor: 4 }, 4)).toEqual({ lines: ['abcd', 'ef'], row: 1, column: 0 });
  });

  it('빈 입력은 빈 한 줄', () => {
    expect(inputLayout({ text: '', cursor: 0 }, 4)).toEqual({ lines: [''], row: 0, column: 0 });
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
