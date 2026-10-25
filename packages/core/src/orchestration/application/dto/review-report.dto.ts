import { DomainError } from '../../../shared/domain-error.js';
import { asRecord, readOptionalString, readString } from '../../../shared/validation.js';
import type { Claim } from '../../domain/fact-check.js';
import { EvidenceDto } from './evidence.dto.js';

export interface ReviewIssue {
  readonly problem: string;
  readonly path: string | null;
  readonly line: number | null;
  readonly evidence: Claim['evidence'];
}

/** 리뷰어 보고. 판정(pass/changes)은 리뷰어 말이 아니라 근거가 확인된 지적으로 rauha가 다시 정한다. */
export class ReviewReportDto {
  private constructor(
    readonly verdict: 'pass' | 'changes',
    readonly summary: string,
    readonly issues: readonly ReviewIssue[],
  ) {}

  static from(input: unknown): ReviewReportDto {
    const obj = asRecord(input, 'ReviewReport');
    const verdict = obj['verdict'];
    if (verdict !== 'pass' && verdict !== 'changes') {
      throw new DomainError('INVALID_INPUT', 'ReviewReport.verdict: pass 또는 changes여야 합니다.');
    }
    const raw = Array.isArray(obj['issues']) ? obj['issues'] : [];
    const issues = raw.map((item, i) => {
      const what = `ReviewReport.issues[${i}]`;
      const issue = asRecord(item, what);
      const line = issue['line'];
      return {
        problem: readString(issue, 'problem', what),
        path: readOptionalString(issue, 'path', what),
        line: typeof line === 'number' && Number.isInteger(line) && line > 0 ? line : null,
        evidence: EvidenceDto.list(issue['evidence'], `${what}.evidence`),
      };
    });
    return new ReviewReportDto(verdict, readString(obj, 'summary', 'ReviewReport'), issues);
  }

  claims(): Claim[] {
    return this.issues.map((issue) => ({
      kind: 'review',
      text: issue.path === null ? issue.problem : `${issue.problem} (${issue.path}${issue.line === null ? '' : `:${issue.line}`})`,
      evidence: issue.evidence,
    }));
  }
}
