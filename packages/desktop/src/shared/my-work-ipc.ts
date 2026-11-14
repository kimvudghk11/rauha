import type { WorkCommit } from './my-work.js';

/** 이력서용 내 작업 채널 */
export const MY_WORK_IPC = {
  scan: 'my-work:scan',
  resume: 'my-work:resume',
} as const;

export type MyWorkResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: string };

export interface MyWorkApi {
  /** 작업 폴더 모든 레포의 커밋(since: 초 단위 UNIX 시각, 0 이면 처음부터) */
  scan(since: number): Promise<MyWorkResult<{ readonly commits: readonly WorkCommit[]; readonly repos: number }>>;
  /** 커밋 요약 메모(제목·숫자만)로 이력서 문장 초안(Haiku 한 번) */
  resume(note: string): Promise<MyWorkResult<string>>;
}
