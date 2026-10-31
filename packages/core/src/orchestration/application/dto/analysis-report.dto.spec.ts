import { describe, expect, it } from 'vitest';
import { AnalysisReportDto } from './analysis-report.dto.js';

describe('AnalysisReportDto', () => {
  it('답 뒤에 살펴본 파일을 ■ 제목 아래 목록으로 붙인다', () => {
    const text = AnalysisReportDto.read({ answer: '원인은 할인 계산 순서예요.', files: ['src/money.ts', ' src/cart.ts '] }, '디버깅').toAnswer();
    expect(text).toBe('원인은 할인 계산 순서예요.\n\n■ 살펴본 파일\n- src/money.ts\n- src/cart.ts');
  });

  it('살펴본 파일이 없으면 답만 보인다', () => {
    expect(AnalysisReportDto.read({ answer: '더 알려 주세요.', files: [] }, '디버깅').toAnswer()).toBe('더 알려 주세요.');
  });

  it('깨진 보고는 어떤 팀원의 보고인지 밝혀 읽지 못했다고 알린다', () => {
    expect(AnalysisReportDto.read(null, '위험 점검').toAnswer()).toContain('위험 점검');
    expect(AnalysisReportDto.read({ answer: '  ', files: [3] }, '위험 점검').toAnswer()).toContain('읽지 못했어요');
  });
});
