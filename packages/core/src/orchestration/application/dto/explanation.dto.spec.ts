import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../shared/domain-error.js';
import { ExplanationDto, MemberReportDto } from './explanation.dto.js';

const explanation = {
  decisions: [{ what: 'discount를 Money 메서드로 둠', why: 'add·multiply와 같은 자리', rejected: '유틸 함수' }],
  readingOrder: [
    { path: 'src/domain/money.ts', line: 30, note: '새 메서드' },
    { path: 'src/domain/money.spec.ts', note: '보장하는 것' },
  ],
  manualChecks: ['Money.of(10000).discount(10) → 9,000원'],
  untested: [],
};

describe('ExplanationDto', () => {
  it('설명은 결정 1–4개, 읽는 순서 2–4개여야 한다', () => {
    expect(() => ExplanationDto.from({ ...explanation, decisions: [] })).toThrow(DomainError);
    expect(() => ExplanationDto.from({ ...explanation, readingOrder: [explanation.readingOrder[0]] })).toThrow(DomainError);
    expect(() => ExplanationDto.from({ ...explanation, readingOrder: Array(5).fill(explanation.readingOrder[0]) })).toThrow(DomainError);
    const dto = ExplanationDto.from(explanation);
    expect(dto.readingOrder[0]).toEqual({ path: 'src/domain/money.ts', line: 30, note: '새 메서드' });
    expect(dto.readingOrder[1]?.line).toBeNull();
    expect(dto.decisions[0]?.rejected).toBe('유틸 함수');
  });

  it('설명이 400토큰을 넘으면 예산 초과', () => {
    expect(ExplanationDto.from(explanation).isWithinBudget()).toBe(true);
    const long = { ...explanation, manualChecks: ['가'.repeat(500)] };
    expect(ExplanationDto.from(long).isWithinBudget()).toBe(false);
  });
});

describe('MemberReportDto', () => {
  const report = { result: 'done', did: ['discount 추가'], changedFiles: ['src/domain/money.ts'], passed: 3, failed: 0 };

  it('구현 보고는 짧은 보고와 설명을 함께 읽는다', () => {
    const dto = MemberReportDto.from({ ...report, explanation }, true);
    expect(dto.report.result).toBe('done');
    expect(dto.explanation?.decisions).toHaveLength(1);
  });

  it('테스트 팀원 보고는 설명 없이 읽는다', () => {
    expect(MemberReportDto.from(report, false).explanation).toBeNull();
  });
});
