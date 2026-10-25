import { describe, expect, it } from 'vitest';
import { editInput, type InputState } from './input-line.js';

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
