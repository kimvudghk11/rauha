import { DomainError } from '../../../shared/domain-error.js';
import type { AreaNote } from '../../domain/repo-knowledge.js';

const isString = (v: unknown): v is string => typeof v === 'string';

/** 조사 팀원 보고 → 영역 메모. 모양이 틀린 항목은 버리고(나머지는 쓸 수 있다), notes 자체가 없으면 거부한다. */
export class SurveyReportDto {
  private constructor(readonly notes: readonly AreaNote[]) {}

  static from(input: unknown): SurveyReportDto {
    const notes = typeof input === 'object' && input !== null ? (input as Record<string, unknown>)['notes'] : undefined;
    if (!Array.isArray(notes)) throw new DomainError('INVALID_INPUT', 'SurveyReport.notes: 배열이 필요합니다.');
    const valid = notes.filter((n): n is AreaNote => {
      const o = n as Record<string, unknown>;
      return typeof n === 'object' && n !== null && isString(o['area']) && isString(o['text']) && Array.isArray(o['sources']) && o['sources'].every(isString);
    });
    return new SurveyReportDto(valid.map((n) => ({ area: n.area, text: n.text, sources: [...n.sources] })));
  }
}
