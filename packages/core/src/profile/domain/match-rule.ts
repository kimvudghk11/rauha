import { expandHome, matchesPattern, normalizeGitRemote, toPosixPath } from '../../shared/path-pattern.js';

export interface WorkspaceContext {
  readonly cwd: string;
  readonly home: string;
  readonly gitRemote: string | null;
}

/** 폴더 경로나 Git 원격 주소로 프로필을 고르는 규칙 한 줄. */
export class MatchRule {
  private constructor(
    readonly kind: 'path' | 'git-remote',
    readonly pattern: string,
    readonly profile: string,
  ) {}

  static path(pattern: string, profile: string): MatchRule {
    return new MatchRule('path', pattern, profile);
  }

  static gitRemote(pattern: string, profile: string): MatchRule {
    return new MatchRule('git-remote', pattern, profile);
  }

  matches(ctx: WorkspaceContext): boolean {
    if (this.kind === 'path') {
      return matchesPattern(expandHome(this.pattern, ctx.home), toPosixPath(ctx.cwd));
    }
    return ctx.gitRemote !== null && matchesPattern(this.pattern, normalizeGitRemote(ctx.gitRemote));
  }
}
