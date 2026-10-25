import { describe, expect, it } from 'vitest';
import { menuKey, menuLines, wrapText } from './menu.js';

const OPTIONS = ['허락', '계속 허락', '거절', '이유 알려 주기'];

describe('menuKey', () => {
  it('위아래 화살표로 움직이고 끝에서는 반대쪽 끝으로 넘어간다', () => {
    expect(menuKey(0, { name: 'down' }, 4)).toEqual({ index: 1, done: false });
    expect(menuKey(0, { name: 'up' }, 4)).toEqual({ index: 3, done: false });
    expect(menuKey(3, { name: 'down' }, 4)).toEqual({ index: 0, done: false });
  });

  it('Enter는 지금 고른 것으로 끝낸다', () => {
    expect(menuKey(2, { name: 'return' }, 4)).toEqual({ index: 2, done: true });
  });

  it('숫자 키는 그 번호를 바로 고른다. 없는 번호는 무시한다', () => {
    expect(menuKey(0, { name: '3', sequence: '3' }, 4)).toEqual({ index: 2, done: true });
    expect(menuKey(1, { name: '9', sequence: '9' }, 4)).toEqual({ index: 1, done: false });
  });

  it('Esc와 Ctrl+C는 취소로 본다', () => {
    expect(menuKey(0, { name: 'escape' }, 4)).toEqual({ index: -1, done: true });
    expect(menuKey(0, { name: 'c', ctrl: true }, 4)).toEqual({ index: -1, done: true });
  });
});

describe('menuLines', () => {
  it('고른 줄에만 ❯ 표시를 붙이고 번호를 1부터 매긴다', () => {
    const lines = menuLines(OPTIONS, 1, (s) => `[${s}]`);
    expect(lines).toEqual(['    1. 허락', '  [❯ 2. 계속 허락]', '    3. 거절', '    4. 이유 알려 주기']);
  });
});

describe('wrapText', () => {
  it('너비를 넘는 줄은 한글을 두 칸으로 세서 접는다', () => {
    expect(wrapText('abcdef', 4)).toEqual(['abcd', 'ef']);
    expect(wrapText('가나다라', 5)).toEqual(['가나', '다라']);
    expect(wrapText('', 4)).toEqual(['']);
  });
});
