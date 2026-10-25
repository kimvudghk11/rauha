import { DomainError } from '../../../shared/domain-error.js';
import { asRecord, readOptionalString, readString, readStringArray } from '../../../shared/validation.js';
import type { Claim, Evidence } from '../../domain/fact-check.js';
import { EvidenceDto } from './evidence.dto.js';
import { WorkReportDto } from './work-report.dto.js';

export const EXPLANATION_TOKEN_BUDGET = 400;
const MAX_FACTS = 6;

export interface Decision {
  readonly what: string;
  readonly why: string;
  readonly rejected: string | null;
  readonly evidence: readonly Evidence[];
}

/** 코드에 넣은 외부 사실(API 경로, 요청·응답 필드, 설정 키, 라이브러리 동작 등) */
export interface Fact {
  readonly claim: string;
  readonly evidence: readonly Evidence[];
}

export interface ReadingStop {
  readonly path: string;
  readonly line: number | null;
  readonly note: string;
}

function readList<T>(obj: Record<string, unknown>, key: string, min: number, max: number, read: (item: Record<string, unknown>, what: string) => T): T[] {
  const raw = obj[key];
  if (!Array.isArray(raw) || raw.length < min || raw.length > max) {
    throw new DomainError('INVALID_INPUT', `Explanation.${key}: ${min}–${max}개여야 합니다.`);
  }
  return raw.map((item, i) => read(asRecord(item, `Explanation.${key}[${i}]`), `Explanation.${key}[${i}]`));
}

function countRange(list: readonly string[], key: string, min: number, max: number): readonly string[] {
  if (list.length < min || list.length > max) {
    throw new DomainError('INVALID_INPUT', `Explanation.${key}: ${min}–${max}개여야 합니다.`);
  }
  return list;
}

/**
 * 구현 팀원의 설명 칸. 사용자가 코드를 읽고 남에게 설명할 수 있게 돕는 읽기 안내서의 재료다.
 * 팀장 컨텍스트에는 들어가지 않고 안내서 조립에만 쓴다.
 */
export class ExplanationDto {
  private constructor(
    readonly decisions: readonly Decision[],
    readonly readingOrder: readonly ReadingStop[],
    readonly manualChecks: readonly string[],
    readonly untested: readonly string[],
    readonly facts: readonly Fact[],
  ) {}

  static from(input: unknown): ExplanationDto {
    const obj = asRecord(input, 'Explanation');
    return new ExplanationDto(
      readList(obj, 'decisions', 1, 4, (item, what) => ({
        what: readString(item, 'what', what),
        why: readString(item, 'why', what),
        rejected: readOptionalString(item, 'rejected', what),
        evidence: EvidenceDto.list(item['evidence'], `${what}.evidence`),
      })),
      readList(obj, 'readingOrder', 2, 4, (item, what) => {
        const line = item['line'];
        return {
          path: readString(item, 'path', what),
          line: typeof line === 'number' && Number.isInteger(line) && line > 0 ? line : null,
          note: readString(item, 'note', what),
        };
      }),
      countRange(readStringArray(obj, 'manualChecks', 'Explanation'), 'manualChecks', 1, 3),
      countRange(readStringArray(obj, 'untested', 'Explanation'), 'untested', 0, 3),
      // 근거 칸이 생기기 전 보고에는 facts가 없다.
      obj['facts'] === undefined
        ? []
        : readList(obj, 'facts', 0, MAX_FACTS, (item, what) => ({
            claim: readString(item, 'claim', what),
            evidence: EvidenceDto.list(item['evidence'], `${what}.evidence`),
          })),
    );
  }

  /** 근거 확인에 넘길 주장 목록: 결정은 '무엇 — 왜', 외부 사실은 그대로. */
  claims(): Claim[] {
    return [
      ...this.decisions.map((d): Claim => ({ kind: 'decision', text: `${d.what} — ${d.why}`, evidence: d.evidence })),
      ...this.facts.map((f): Claim => ({ kind: 'fact', text: f.claim, evidence: f.evidence })),
    ];
  }

  /** WorkReportDto.estimateTokens와 같은 보수적 계산. */
  estimateTokens(): number {
    const text = JSON.stringify([this.decisions, this.readingOrder, this.manualChecks, this.untested]);
    let ascii = 0;
    let other = 0;
    for (const ch of text) {
      if (ch.charCodeAt(0) < 128) ascii += 1;
      else other += 1;
    }
    return Math.ceil(ascii / 4) + other;
  }

  isWithinBudget(limit: number = EXPLANATION_TOKEN_BUDGET): boolean {
    return this.estimateTokens() <= limit;
  }
}

/** 팀원 보고(구조화 출력) = 팀장용 짧은 보고 + (구현 팀원이면) 설명. */
export class MemberReportDto {
  private constructor(
    readonly report: WorkReportDto,
    readonly explanation: ExplanationDto | null,
  ) {}

  static from(input: unknown, withExplanation: boolean): MemberReportDto {
    const obj = asRecord(input, 'MemberReport');
    return new MemberReportDto(
      WorkReportDto.from(obj),
      withExplanation ? ExplanationDto.from(obj['explanation']) : null,
    );
  }
}
