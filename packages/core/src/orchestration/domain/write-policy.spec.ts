import { describe, expect, it } from 'vitest';
import { WritePolicy } from './write-policy.js';

const policy = WritePolicy.forScope(['src/money/**']);

describe('WritePolicy', () => {
  it('테스트 팀원은 잠기기 전까지 범위 안 소스에 빈 시그니처를 만들 수 있다', () => {
    expect(policy.allows('tester', 'src/money/discount.ts', false)).toBe(true);
    expect(policy.allows('tester', 'src/money/discount.spec.ts', false)).toBe(true);
  });

  it('테스트가 잠기면 테스트 팀원은 범위 안 소스도 쓸 수 없다', () => {
    expect(policy.allows('tester', 'src/money/discount.ts', true)).toBe(false);
  });

  it('테스트 팀원은 범위 밖 소스를 쓸 수 없다', () => {
    expect(policy.allows('tester', 'src/cart/cart.ts', false)).toBe(false);
  });
});
