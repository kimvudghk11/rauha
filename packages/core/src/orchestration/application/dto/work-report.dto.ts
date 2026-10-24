import { DomainError } from '../../../shared/domain-error.js';
import {
  asRecord,
  readInt,
  readOptionalString,
  readStringArray,
} from '../../../shared/validation.js';
import { TestRun } from '../../domain/test-run.js';

export type ReportResult = 'done' | 'failed' | 'needs-decision';

const RESULTS: readonly ReportResult[] = ['done', 'failed', 'needs-decision'];
const RESULT_LABEL: Readonly<Record<ReportResult, string>> = {
  done: '완료',
  failed: '실패',
  'needs-decision': '판단 필요',
};
const MAX_DID_LINES = 3;
export const REPORT_TOKEN_BUDGET = 300;

/** 팀원 → 팀장 보고서. 설계서의 「팀원 보고서 양식」과 같은 칸을 가진다. */
export class WorkReportDto {
  private constructor(
    readonly result: ReportResult,
    readonly did: readonly string[],
    readonly changedFiles: readonly string[],
    readonly passed: number,
    readonly failed: number,
    readonly failedTests: readonly string[],
    readonly remaining: string | null,
    readonly question: string | null,
  ) {}

  static from(input: unknown): WorkReportDto {
    const obj = asRecord(input, 'WorkReport');
    const result = obj['result'];
    if (typeof result !== 'string' || !RESULTS.includes(result as ReportResult)) {
      throw new DomainError('INVALID_INPUT', `WorkReport.result: ${RESULTS.join(' / ')} 중 하나여야 합니다.`);
    }
    const did = readStringArray(obj, 'did', 'WorkReport');
    if (did.length === 0 || did.length > MAX_DID_LINES) {
      throw new DomainError('INVALID_INPUT', `WorkReport.did: 1–${MAX_DID_LINES}줄이어야 합니다.`);
    }
    return new WorkReportDto(
      result as ReportResult,
      did,
      readStringArray(obj, 'changedFiles', 'WorkReport'),
      readInt(obj, 'passed', 'WorkReport'),
      readInt(obj, 'failed', 'WorkReport'),
      readStringArray(obj, 'failedTests', 'WorkReport'),
      readOptionalString(obj, 'remaining', 'WorkReport'),
      readOptionalString(obj, 'question', 'WorkReport'),
    );
  }

  /**
   * 대략적인 토큰 수. 영문은 4글자당 1토큰, 한글 등 그 밖의 문자는 1글자당 1토큰으로
   * 넉넉하게 잡는다. 예산 초과 여부를 가르는 용도라 보수적으로 계산한다.
   */
  estimateTokens(): number {
    const text = this.toMarkdown();
    let ascii = 0;
    let other = 0;
    for (const ch of text) {
      if (ch.charCodeAt(0) < 128) ascii += 1;
      else other += 1;
    }
    return Math.ceil(ascii / 4) + other;
  }

  isWithinBudget(limit: number = REPORT_TOKEN_BUDGET): boolean {
    return this.estimateTokens() <= limit;
  }

  toTestRun(): TestRun {
    return TestRun.of({ passed: this.passed, failed: this.failed, failedNames: this.failedTests });
  }

  /** 승격 시 다음 팀원에게 넘길 한 줄 요약. */
  toFailureNote(): string {
    const tests = this.failedTests.length > 0 ? this.failedTests.join(', ') : `${this.failed}개`;
    return `${this.did.join(' / ')} → 실패: ${tests}`;
  }

  toMarkdown(): string {
    const tests =
      `통과 ${this.passed} / 실패 ${this.failed}` +
      (this.failedTests.length > 0 ? ` (${this.failedTests.join(', ')})` : '');
    return [
      `- 결과: ${RESULT_LABEL[this.result]}`,
      `- 한 일: ${this.did.join(' / ')}`,
      `- 바뀐 파일: ${this.changedFiles.length > 0 ? this.changedFiles.join(', ') : '없음'}`,
      `- 테스트: ${tests}`,
      `- 남은 문제: ${this.remaining ?? '없음'}`,
      `- 팀장 판단 필요: ${this.question ?? '없음'}`,
    ].join('\n');
  }
}
