import { describe, expect, it } from 'vitest';
import { DomainError } from '../../shared/domain-error.js';
import { Difficulty } from './difficulty.js';

describe('Difficulty.judge', () => {
  it.each([
    [1, 'S'],
    [2, 'S'],
    [3, 'M'],
    [5, 'M'],
    [6, 'L'],
  ] as const)('파일 %i개는 %s급', (fileCount, grade) => {
    expect(Difficulty.judge({ fileCount, crossModule: false, sensitive: false }).grade).toBe(grade);
  });

  it('인증·결제 같은 민감 작업은 파일 1개여도 L급', () => {
    const d = Difficulty.judge({ fileCount: 1, crossModule: false, sensitive: true });
    expect(d.grade).toBe('L');
    expect(d.startsWithSenior()).toBe(true);
  });

  it('설계 단계(설계 대화)가 생기기 전까지 L급도 설계를 거치지 않고 바로 테스트부터 한다 (돌려보내지 않는다)', () => {
    expect(Difficulty.of('L').requiresDesign()).toBe(false);
  });

  it('모듈 간 변경은 L급', () => {
    expect(Difficulty.judge({ fileCount: 2, crossModule: true, sensitive: false }).grade).toBe('L');
  });

  it('파일 수가 0이면 거부', () => {
    expect(() => Difficulty.judge({ fileCount: 0, crossModule: false, sensitive: false })).toThrow(DomainError);
  });
});
