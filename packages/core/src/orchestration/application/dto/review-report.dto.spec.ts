import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../shared/domain-error.js';
import { ReviewReportDto } from './review-report.dto.js';

const blank = { path: null, line: null, quote: null, name: null, url: null, text: null };

describe('ReviewReportDto', () => {
  it('리뷰 지적을 근거와 함께 주장 목록으로 바꾼다', () => {
    const dto = ReviewReportDto.from({
      verdict: 'changes',
      summary: '할인액을 먼저 버린다',
      issues: [
        { problem: '할인액을 먼저 버려서 999원이 900원이 된다', path: 'src/money.ts', line: 3, evidence: [{ ...blank, kind: 'code', path: 'src/money.ts', line: 3, quote: 'Math.floor(rate)' }] },
        { problem: '이름이 어색하다', path: null, line: null, evidence: [] },
      ],
    });
    expect(dto.verdict).toBe('changes');
    expect(dto.claims()).toEqual([
      { kind: 'review', text: '할인액을 먼저 버려서 999원이 900원이 된다 (src/money.ts:3)', evidence: [{ kind: 'code', path: 'src/money.ts', line: 3, quote: 'Math.floor(rate)' }] },
      { kind: 'review', text: '이름이 어색하다', evidence: [] },
    ]);
  });

  it('verdict는 pass나 changes여야 한다', () => {
    expect(() => ReviewReportDto.from({ verdict: 'maybe', summary: 's', issues: [] })).toThrow(DomainError);
  });
});
