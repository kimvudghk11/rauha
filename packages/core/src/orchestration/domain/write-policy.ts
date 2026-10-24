import { DomainError } from '../../shared/domain-error.js';
import { matchesPattern, toPosixPath } from '../../shared/path-pattern.js';
import type { TeamRole } from './team.js';

const TEST_FILE = /(^|\/)(tests?|__tests__)\/|\.(spec|test)\.[cm]?[jt]sx?$/;

/**
 * 역할별 쓰기 권한. 설계서의 팀별 「권한」 행을 코드로 옮겼다.
 * 경로는 저장소 루트 기준 상대 경로다.
 */
export class WritePolicy {
  private constructor(private readonly scope: readonly string[]) {}

  /** scope: 업무 지시서의 「범위」. 구현·리뷰 팀은 이 안에서만 쓸 수 있다. */
  static forScope(scope: readonly string[]): WritePolicy {
    return new WritePolicy(scope.map(toPosixPath));
  }

  static isTestFile(path: string): boolean {
    return TEST_FILE.test(toPosixPath(path));
  }

  allows(role: TeamRole, path: string, testsLocked: boolean): boolean {
    const p = toPosixPath(path);
    switch (role) {
      case 'planner':
        return matchesPattern('features/**', p);
      case 'architect':
        return matchesPattern('docs/adr/**', p);
      case 'tester':
        return !testsLocked && WritePolicy.isTestFile(p);
      case 'implementer':
      case 'reviewer':
        return !WritePolicy.isTestFile(p) && this.inScope(p);
      case 'writer':
        return matchesPattern('docs/**', p) || p === 'CHANGELOG.md' || p === 'README.md';
      case 'infra':
        return matchesPattern('infra/**', p);
      case 'lead':
      case 'debugger':
        return false;
    }
  }

  /** 거부된 경로가 하나라도 있으면 diff 전체를 거부한다. */
  assertDiff(role: TeamRole, paths: readonly string[], testsLocked: boolean): void {
    const denied = paths.filter((path) => !this.allows(role, path, testsLocked));
    if (denied.length > 0) {
      throw new DomainError(
        'WRITE_DENIED',
        `${role} 역할은 다음 파일을 바꿀 수 없습니다: ${denied.join(', ')}`,
      );
    }
  }

  private inScope(path: string): boolean {
    return this.scope.some((pattern) => matchesPattern(pattern, path));
  }
}
