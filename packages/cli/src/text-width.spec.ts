import { describe, expect, it } from 'vitest';
import { displayWidth, fitLines } from './text-width.js';

describe('fitLines', () => {
  it('줄마다 너비를 넘지 않게 접고, 원래 줄바꿈도 지킨다', () => {
    expect(fitLines('가나다라\nabcde', 4)).toEqual(['가나', '다라', 'abcd', 'e']);
  });

  it('색 코드는 칸을 차지하지 않고 중간에 쪼개지지 않는다', () => {
    const lines = fitLines(`\x1b[38;5;117m${'a'.repeat(6)}\x1b[0m`, 4);
    expect(lines).toHaveLength(2);
    expect(lines.map(displayWidth)).toEqual([4, 2]);
    expect(lines.join('')).toBe(`\x1b[38;5;117m${'a'.repeat(6)}\x1b[0m`);
  });

  it('빈 줄도 한 줄로 남는다', () => {
    expect(fitLines('a\n\nb', 10)).toEqual(['a', '', 'b']);
  });
});
