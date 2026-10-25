import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../shared/domain-error.js';
import { AnswerDto } from './answer.dto.js';

const blank = { path: null, line: null, quote: null, name: null, url: null, text: null };

describe('AnswerDto', () => {
  it('답의 주장을 근거와 함께 읽는다', () => {
    const dto = AnswerDto.from({
      answer: '할인 후 금액에서 버리기로 정했기 때문입니다.',
      claims: [{ text: 'floor는 할인 후 금액에 쓴다', evidence: [{ ...blank, kind: 'record', text: 'Math.floor를 할인 후 금액에 씀' }] }],
    });
    expect(dto.answer).toBe('할인 후 금액에서 버리기로 정했기 때문입니다.');
    expect(dto.claims()).toEqual([{ kind: 'fact', text: 'floor는 할인 후 금액에 쓴다', evidence: [{ kind: 'record', text: 'Math.floor를 할인 후 금액에 씀' }] }]);
  });

  it('답이 비면 거부한다', () => {
    expect(() => AnswerDto.from({ answer: '', claims: [] })).toThrow(DomainError);
  });
});
