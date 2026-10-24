import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../shared/domain-error.js';
import { WorkReportDto } from './work-report.dto.js';

const valid = {
  result: 'failed',
  did: ['잠금 카운터 추가', '15분 잠금 구현'],
  changedFiles: ['src/auth/login.ts'],
  passed: 4,
  failed: 1,
  failedTests: ['LOGIN-03 잠금 메시지'],
  remaining: '메시지 문구 불일치',
  question: null,
};

describe('WorkReportDto', () => {
  it('보고서 양식으로 출력한다', () => {
    const md = WorkReportDto.from(valid).toMarkdown();
    expect(md).toContain('- 결과: 실패');
    expect(md).toContain('통과 4 / 실패 1 (LOGIN-03 잠금 메시지)');
    expect(md).toContain('- 팀장 판단 필요: 없음');
  });

  it('짧은 보고서는 300토큰 예산 안에 든다', () => {
    expect(WorkReportDto.from(valid).isWithinBudget()).toBe(true);
  });

  it('긴 보고서는 예산을 넘는다고 판정한다', () => {
    const long = { ...valid, remaining: '아'.repeat(400) };
    expect(WorkReportDto.from(long).isWithinBudget()).toBe(false);
  });

  it('한 일은 3줄을 넘을 수 없다', () => {
    expect(() => WorkReportDto.from({ ...valid, did: ['a', 'b', 'c', 'd'] })).toThrow(DomainError);
  });

  it('결과 값이 양식에 없으면 거부한다', () => {
    expect(() => WorkReportDto.from({ ...valid, result: 'ok' })).toThrow(DomainError);
  });

  it('테스트 결과와 실패 요약으로 바꿀 수 있다', () => {
    const dto = WorkReportDto.from(valid);
    expect(dto.toTestRun().isGreen()).toBe(false);
    expect(dto.toFailureNote()).toBe('잠금 카운터 추가 / 15분 잠금 구현 → 실패: LOGIN-03 잠금 메시지');
  });
});
