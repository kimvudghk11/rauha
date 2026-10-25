import { describe, expect, it } from 'vitest';
import { AppError } from '../shared/errors.js';
import { Money } from './money.js';

describe('Money', () => {
  it('더하고 곱한다', () => {
    expect(Money.of(1000).add(Money.of(500)).amount).toBe(1500);
    expect(Money.of(1000).multiply(3).amount).toBe(3000);
  });

  it('음수나 소수 금액은 만들 수 없다', () => {
    expect(() => Money.of(-1)).toThrow(AppError);
    expect(() => Money.of(1.5)).toThrow(AppError);
  });

  it('원 단위로 표시한다', () => {
    expect(Money.of(12000).toString()).toBe('12,000원');
  });
});
