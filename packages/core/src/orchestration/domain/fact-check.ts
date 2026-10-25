/** 팀원이 주장에 붙이는 근거. 확인은 팀원 말이 아니라 rauha가 모은 재료(EvidenceSources)로 한다. */
export type Evidence =
  | { readonly kind: 'code'; readonly path: string; readonly line: number | null; readonly quote: string }
  | { readonly kind: 'test'; readonly name: string }
  | { readonly kind: 'web'; readonly url: string; readonly quote: string | null }
  | { readonly kind: 'user'; readonly text: string };

/** decision: 구현 결정과 이유, fact: 코드에 넣은 외부 사실, review: 리뷰어 지적 */
export type ClaimKind = 'decision' | 'fact' | 'review';

export interface Claim {
  readonly kind: ClaimKind;
  readonly text: string;
  readonly evidence: readonly Evidence[];
}

/** 근거를 확인할 재료. 인프라가 실제로 읽고, 돌리고, 연 것만 담는다. */
export interface EvidenceSources {
  /** 근거에 나온 경로 → 내용. 없거나 작업 폴더 밖이면 null */
  readonly files: ReadonlyMap<string, string | null>;
  /** 이번 실행 검증에서 통과한 테스트의 전체 이름 */
  readonly passedTests: readonly string[];
  /** 정규화한 URL → 팀원이 실제로 가져온 본문(못 남겼으면 null) */
  readonly fetched: ReadonlyMap<string, string | null>;
  /** 확정된 가정과 사용자 정정 */
  readonly userStatements: readonly string[];
}

export interface CheckedClaim extends Claim {
  readonly verified: readonly Evidence[];
  readonly isGuess: boolean;
}

/** 이보다 짧은 인용은 아무 파일에서나 찾아져서 근거가 되지 못한다(공백 제외 글자 수). */
const MIN_QUOTE = 8;

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();
const contains = (haystack: string, needle: string) => squash(haystack).includes(squash(needle));

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.trim().replace(/#.*$/, '').replace(/\/$/, '');
  }
}

function isVerified(evidence: Evidence, sources: EvidenceSources): boolean {
  switch (evidence.kind) {
    case 'code': {
      const content = sources.files.get(evidence.path) ?? null;
      return content !== null && evidence.quote.replace(/\s/g, '').length >= MIN_QUOTE && contains(content, evidence.quote);
    }
    case 'test':
      return evidence.name.trim() !== '' && sources.passedTests.some((name) => contains(name, evidence.name));
    case 'web': {
      const url = normalizeUrl(evidence.url);
      if (!sources.fetched.has(url)) return false;
      const body = sources.fetched.get(url) ?? null;
      return body === null || evidence.quote === null || contains(body, evidence.quote);
    }
    case 'user':
      return evidence.text.trim() !== '' && sources.userStatements.some((statement) => contains(statement, evidence.text));
  }
}

/** 주장마다 근거를 확인한다. 확인된 근거가 하나도 없으면 추측이다. */
export class FactCheck {
  private constructor(private readonly checked: readonly CheckedClaim[]) {}

  static of(claims: readonly Claim[], sources: EvidenceSources): FactCheck {
    return new FactCheck(
      claims.map((claim) => {
        const verified = claim.evidence.filter((e) => isVerified(e, sources));
        return { ...claim, verified, isGuess: verified.length === 0 };
      }),
    );
  }

  all(): readonly CheckedClaim[] {
    return this.checked;
  }

  guesses(kind?: ClaimKind): readonly CheckedClaim[] {
    return this.checked.filter((c) => c.isGuess && (kind === undefined || c.kind === kind));
  }

  verifiedClaims(): readonly CheckedClaim[] {
    return this.checked.filter((c) => !c.isGuess);
  }
}

/** code 근거에 나온 경로(중복 없이). 인프라가 이 파일들만 읽는다. */
export function citedPaths(claims: readonly Claim[]): string[] {
  return [...new Set(claims.flatMap((c) => c.evidence.flatMap((e) => (e.kind === 'code' ? [e.path] : []))))];
}

/**
 * 리뷰 판정. 근거가 확인된 지적과 사용자 정정만 2차 구현을 일으킨다.
 * 근거 없는 지적은 안내서에 '리뷰어 추측'으로만 남는다.
 */
export class ReviewFindings {
  private constructor(
    private readonly issues: readonly CheckedClaim[],
    private readonly corrections: readonly string[],
  ) {}

  static of(reviewIssues: FactCheck, corrections: readonly string[]): ReviewFindings {
    return new ReviewFindings(reviewIssues.verifiedClaims(), corrections.map((c) => c.trim()).filter((c) => c !== ''));
  }

  verdict(): 'pass' | 'changes' {
    return this.issues.length > 0 || this.corrections.length > 0 ? 'changes' : 'pass';
  }

  feedback(): string {
    return [
      ...this.issues.map((issue) => `- 리뷰 지적: ${issue.text}`),
      ...this.corrections.map((correction) => `- 사용자 정정: ${correction}`),
    ].join('\n');
  }
}
