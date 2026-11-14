/** git 탭 안의 화면들 */
export type GitViewId = 'changes' | 'branches' | 'history' | 'stash' | 'actions' | 'mywork' | 'conflicts';

export interface TabState {
  readonly merging: boolean;
  readonly files: readonly { readonly conflict: boolean }[];
  /** 원격이 있다(있으면 GitHub Actions 탭을 보인다) */
  readonly hasRemote?: boolean;
}

/**
 * 지금 보여 줄 화면 탭들. 충돌 탭은 머지 중이거나 풀지 않은 충돌 파일이 있을 때만 생긴다.
 * Actions 탭은 원격이 있을 때만. 상태를 아직 모르면(null) 기본 넷만 보인다.
 */
export function visibleGitViews(state: TabState | null): GitViewId[] {
  const show: GitViewId[] = ['changes', 'branches', 'history', 'stash'];
  if (state?.hasRemote === true) show.push('actions');
  // 내 작업(이력서용)은 레포와 상관없이 늘 있다: 작업 폴더의 모든 레포를 본다
  show.push('mywork');
  if (state !== null && (state.merging || state.files.some((f) => f.conflict))) show.push('conflicts');
  return show;
}

/** 보이지 않는 탭에 있던 사람은 변경 탭으로 돌아온다 */
export function settleGitView(current: GitViewId, state: TabState | null): GitViewId {
  return visibleGitViews(state).includes(current) ? current : 'changes';
}
