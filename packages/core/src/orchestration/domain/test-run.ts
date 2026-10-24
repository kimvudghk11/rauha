import { DomainError } from '../../shared/domain-error.js';

/**
 * 실패 원인. Red 단계에서는 assertion 실패만 "올바른 이유로 실패"로 인정한다.
 * compile / import 실패는 테스트가 아직 제대로 쓰이지 않았다는 뜻이다.
 */
export type FailureKind = 'assertion' | 'compile' | 'import' | 'timeout';

/** 테스트 실행 결과 값 객체. 판정은 모델이 아니라 이 객체의 메서드가 한다. */
export class TestRun {
  private constructor(
    readonly passed: number,
    readonly failed: number,
    readonly failureKind: FailureKind | null,
    readonly failedNames: readonly string[],
  ) {}

  static of(props: {
    passed: number;
    failed: number;
    failureKind?: FailureKind | null;
    failedNames?: readonly string[];
  }): TestRun {
    const { passed, failed } = props;
    if (![passed, failed].every((n) => Number.isInteger(n) && n >= 0)) {
      throw new DomainError('INVALID_TEST_RUN', '통과·실패 수는 0 이상의 정수여야 합니다.');
    }
    const failureKind = failed > 0 ? (props.failureKind ?? 'assertion') : null;
    return new TestRun(passed, failed, failureKind, [...(props.failedNames ?? [])]);
  }

  isGreen(): boolean {
    return this.failed === 0 && this.passed > 0;
  }

  /** 테스트가 실행은 됐고, 기대값이 달라서 실패했는지. */
  isValidRed(): boolean {
    return this.failed > 0 && this.failureKind === 'assertion';
  }
}
