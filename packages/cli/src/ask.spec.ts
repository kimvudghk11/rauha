import { describe, expect, it } from 'vitest';
import { parseChoice, toPermissionAnswer } from './ask.js';

describe('toPermissionAnswer', () => {
  it('1 허락, 2 이번 실행 동안 계속 허락, 3 거절, 4 이유를 붙여 거절', () => {
    expect(toPermissionAnswer(0, null)).toEqual({ kind: 'allow' });
    expect(toPermissionAnswer(1, null)).toEqual({ kind: 'allow-always' });
    expect(toPermissionAnswer(2, null)).toEqual({ kind: 'deny', note: null });
    expect(toPermissionAnswer(3, ' build만 지워 ')).toEqual({ kind: 'deny', note: 'build만 지워' });
  });

  it('취소(Esc)나 빈 이유는 그냥 거절이다', () => {
    expect(toPermissionAnswer(-1, null)).toEqual({ kind: 'deny', note: null });
    expect(toPermissionAnswer(3, '   ')).toEqual({ kind: 'deny', note: null });
  });
});

describe('parseChoice', () => {
  it('Enter만 누르면 추천 해석(0)', () => {
    expect(parseChoice('', 2)).toBe(0);
  });

  it('번호는 1부터 센다', () => {
    expect(parseChoice('1', 3)).toBe(0);
    expect(parseChoice(' 2 ', 3)).toBe(1);
    expect(parseChoice('3', 3)).toBe(2);
  });

  it('범위 밖이거나 숫자가 아니면 추천 해석으로 본다', () => {
    expect(parseChoice('4', 3)).toBe(0);
    expect(parseChoice('0', 3)).toBe(0);
    expect(parseChoice('두번째', 3)).toBe(0);
  });
});
