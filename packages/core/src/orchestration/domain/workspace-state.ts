import { DomainError } from '../../shared/domain-error.js';

const LISTED_FILES = 10;

/**
 * 시작 전 작업 트리 상태. rauha는 커밋하지 않으므로, 사용자가 바꾼 것과
 * 팀원이 바꾼 것이 섞이지 않도록 깨끗한 작업 트리에서만 시작한다.
 */
export class WorkspaceState {
  private constructor(private readonly dirty: readonly string[] | null) {}

  /** dirty: 커밋하지 않은 파일 목록. null이면 git 저장소가 아니다. */
  static of(dirty: readonly string[] | null): WorkspaceState {
    return new WorkspaceState(dirty === null ? null : [...dirty]);
  }

  assertReady(requireClean: boolean): void {
    if (this.dirty === null) {
      throw new DomainError('NOT_A_REPO', 'git 저장소에서만 실행할 수 있습니다. 바뀐 파일을 git으로 추적하기 때문입니다.');
    }
    if (requireClean && this.dirty.length > 0) {
      const listed = this.dirty.slice(0, LISTED_FILES).join(', ');
      const more = this.dirty.length > LISTED_FILES ? ` 외 ${this.dirty.length - LISTED_FILES}개` : '';
      throw new DomainError(
        'DIRTY_WORKTREE',
        `커밋하지 않은 변경이 있습니다: ${listed}${more}. 직접 커밋하거나 stash한 뒤 다시 실행하세요.`,
      );
    }
  }
}
