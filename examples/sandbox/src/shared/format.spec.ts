import { describe, expect, it } from 'vitest';
import { formatWon } from './format.js';

describe('formatWon', () => {
  it('세 자리마다 쉼표를 찍고 원을 붙인다', () => {
    expect(formatWon(12000)).toBe('12,000원');
    expect(formatWon(0)).toBe('0원');
  });
});
