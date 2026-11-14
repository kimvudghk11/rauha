import { basename } from 'node:path';
import { parseWorkLog, WORK_LOG_FORMAT, type WorkCommit } from '../../shared/my-work.js';
import { runGit } from './git-run.js';

const MAX_COMMITS_PER_REPO = 5000;

/**
 * 작업 폴더 레포들의 커밋(모든 브랜치, 병합 제외)을 읽는다. 읽기만 한다.
 * since 는 초 단위 UNIX 시각(0 이면 처음부터).
 */
export async function scanMyWork(repos: readonly string[], since: number): Promise<WorkCommit[]> {
  const out: WorkCommit[] = [];
  const seen = new Set<string>();
  for (const root of repos) {
    const args = ['log', '--all', '--no-merges', `--format=${WORK_LOG_FORMAT}`, '--numstat', '-n', String(MAX_COMMITS_PER_REPO)];
    if (since > 0) args.push(`--since=@${Math.floor(since)}`);
    const r = await runGit(root, args).catch(() => null);
    if (r === null || r.code !== 0) continue;
    // 같은 커밋이 여러 레포(worktree 등)에 있으면 한 번만
    for (const c of parseWorkLog(r.stdout, basename(root))) {
      if (seen.has(c.hash)) continue;
      seen.add(c.hash);
      out.push(c);
    }
  }
  return out;
}
