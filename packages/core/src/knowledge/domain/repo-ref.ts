/** 무엇을 보고 판단했는지: 브랜치(detached면 null), 커밋, 커밋하지 않은 변경이 있었는지. */
export class RepoRef {
  private constructor(
    readonly branch: string | null,
    readonly commit: string,
    readonly dirty: boolean,
  ) {}

  static of(p: { branch: string | null; commit: string; dirty: boolean }): RepoRef {
    return new RepoRef(p.branch, p.commit, p.dirty);
  }

  /** `main (a1b2c3d)`, 브랜치가 없으면 `a1b2c3d`, 커밋 안 한 변경이 있으면 ` + 작업 트리 변경`. */
  label(): string {
    const short = this.commit.slice(0, 7);
    return `${this.branch === null ? short : `${this.branch} (${short})`}${this.dirty ? ' + 작업 트리 변경' : ''}`;
  }
}
