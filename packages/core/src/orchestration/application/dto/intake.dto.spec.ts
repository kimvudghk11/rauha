import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../shared/domain-error.js';
import { IntakeDto } from './intake.dto.js';

const valid = {
  title: 'Money 할인 적용',
  fileCount: 2,
  crossModule: false,
  sensitive: false,
  scope: ['src/domain/money.ts', 'src/domain/money.spec.ts'],
  acceptance: [
    { kind: 'happy', text: '10% 할인하면 9,000원이 된다' },
    { kind: 'error', text: '할인율이 100을 넘으면 AppError' },
    { kind: 'error', text: '할인율이 음수면 AppError' },
  ],
  doneWhen: 'money.spec.ts의 discount 테스트가 통과',
  forbidden: ['shared/ 수정'],
};

describe('IntakeDto', () => {
  it('수용 기준의 정상·예외 경로 수로 시나리오 요약을 만든다', () => {
    expect(IntakeDto.from(valid).toScenarioSummary()).toEqual({ happyPaths: 1, errorPaths: 2 });
  });

  it('업무 지시서로 S급 업무를 연다', () => {
    const order = IntakeDto.from(valid).toOpenWorkOrder().toEntity('w1');
    expect(order.difficulty.grade).toBe('S');
    expect(order.title).toBe('Money 할인 적용');
  });

  it('범위가 비면 접수를 거부한다', () => {
    expect(() => IntakeDto.from({ ...valid, scope: [] })).toThrow(DomainError);
  });

  it('수용 기준의 종류는 happy 또는 error여야 한다', () => {
    expect(() => IntakeDto.from({ ...valid, acceptance: [{ kind: 'maybe', text: 'x' }] })).toThrow(/happy/);
  });

  it('업무 지시서는 상위 설계 양식대로 쓴다', () => {
    const brief = IntakeDto.from(valid).toBrief('S');
    expect(brief).toContain('## 업무: Money 할인 적용');
    expect(brief).toContain('- 등급: S');
    expect(brief).toContain('- 범위: src/domain/money.ts, src/domain/money.spec.ts');
    expect(brief).toContain('- 금지: shared/ 수정');
    expect(brief).toContain('[예외] 할인율이 음수면 AppError');
  });
});

describe('IntakeDto — 해석이 갈리는 요청', () => {
  const assumption = { question: '원 미만은 무엇을 버리나', chosen: '할인 후 금액에서 원 미만을 버린다(999원 10% → 899원)', alternatives: ['할인액에서 원 미만을 버린다(999원 10% → 900원)'] };

  it('해석이 갈리는 지점을 고른 해석과 다른 후보와 함께 읽는다', () => {
    const dto = IntakeDto.from({ ...valid, assumptions: [assumption] });
    expect(dto.assumptions).toEqual([assumption]);
  });

  it('가정이 없으면 빈 목록이다', () => {
    expect(IntakeDto.from(valid).assumptions).toEqual([]);
  });

  it('가정은 3개까지, 다른 후보는 1개 이상이어야 한다', () => {
    expect(() => IntakeDto.from({ ...valid, assumptions: Array(4).fill(assumption) })).toThrow(DomainError);
    expect(() => IntakeDto.from({ ...valid, assumptions: [{ ...assumption, alternatives: [] }] })).toThrow(DomainError);
  });

  it('업무 지시서에 확정된 해석을 적는다', () => {
    const brief = IntakeDto.from({ ...valid, assumptions: [assumption] }).toBrief('S');
    expect(brief).toContain('정해 둔 해석');
    expect(brief).toContain('원 미만은 무엇을 버리나 → 할인 후 금액에서 원 미만을 버린다');
  });
});
