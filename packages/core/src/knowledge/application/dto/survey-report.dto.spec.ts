import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../shared/domain-error.js';
import { SurveyReportDto } from './survey-report.dto.js';

describe('SurveyReportDto', () => {
  it('영역 메모를 읽고 모양이 틀린 항목은 버린다', () => {
    const notes = SurveyReportDto.from({ notes: [{ area: 'src', text: '메모', sources: ['src/a.ts'] }, { area: 1, text: 'x', sources: [] }] }).notes;
    expect(notes).toEqual([{ area: 'src', text: '메모', sources: ['src/a.ts'] }]);
  });

  it('빈 메모 목록도 된다', () => {
    expect(SurveyReportDto.from({ notes: [] }).notes).toEqual([]);
  });

  it('notes가 없으면 거부한다', () => {
    expect(() => SurveyReportDto.from({})).toThrow(DomainError);
  });
});
