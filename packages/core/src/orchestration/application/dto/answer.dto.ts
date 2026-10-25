import { asRecord, readString } from '../../../shared/validation.js';
import type { Claim } from '../../domain/fact-check.js';
import { EvidenceDto } from './evidence.dto.js';

/** 질문에 대한 답. 답의 주장마다 근거가 붙고, 확인은 rauha가 한다. */
export class AnswerDto {
  private constructor(
    readonly answer: string,
    private readonly items: readonly Claim[],
  ) {}

  static from(input: unknown): AnswerDto {
    const obj = asRecord(input, 'Answer');
    const raw = Array.isArray(obj['claims']) ? obj['claims'] : [];
    const items = raw.map((item, i): Claim => {
      const claim = asRecord(item, `Answer.claims[${i}]`);
      return { kind: 'fact', text: readString(claim, 'text', `Answer.claims[${i}]`), evidence: EvidenceDto.list(claim['evidence'], `Answer.claims[${i}].evidence`) };
    });
    return new AnswerDto(readString(obj, 'answer', 'Answer'), items);
  }

  claims(): Claim[] {
    return [...this.items];
  }
}
