import { readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseWorkLog, WORK_LOG_FORMAT, type RepoStack, type WorkCommit } from '../../shared/my-work.js';
import { isManifestPath, stackOf } from '../../shared/tech-stack.js';
import { architectureOf, stackFromPaths } from '../../shared/architecture.js';
import { runGit } from './git-run.js';

const MAX_COMMITS_PER_REPO = 5000;
const MANIFESTS_PER_REPO = 120;
const MANIFEST_MAX_BYTES = 256 * 1024;

/**
 * 레포마다 설정 파일(package.json·build.gradle·pom.xml·go.mod·Dockerfile·Actions·Terraform …)에서 기술 이름만 읽고,
 * 파일 배치(경로 목록)로 프레임워크·아키텍처 신호를 읽는다. git 이 추적하는 파일만, 깊이 5까지, 크기 제한. 읽기만 하고 내용은 밖으로 보내지 않는다(기술 이름만 남는다).
 */
export async function scanRepoStacks(repos: readonly string[]): Promise<RepoStack[]> {
  const out: RepoStack[] = [];
  for (const root of repos) {
    const r = await runGit(root, ['ls-files', '-z']).catch(() => null);
    if (r === null || r.code !== 0) continue;
    const all = r.stdout.split('\0').filter((p) => p !== '');
    // 얕은 설정 파일부터(큰 모노레포에서 잘려도 중요한 것부터 읽게)
    const paths = all.filter(isManifestPath).sort((a, b) => a.split('/').length - b.split('/').length).slice(0, MANIFESTS_PER_REPO);
    const files: { path: string; text: string }[] = [];
    for (const p of paths) {
      const full = join(root, p);
      const size = (await stat(full).catch(() => null))?.size ?? Infinity;
      if (size > MANIFEST_MAX_BYTES) continue;
      const text = await readFile(full, 'utf8').catch(() => null);
      if (text !== null) files.push({ path: p, text });
    }
    // 설정 파일 스택 + 파일 구성으로 알아본 프레임워크(nest-cli.json·모듈·컨트롤러 등), 그리고 아키텍처 신호
    const stack = [...new Set([...stackOf(files), ...stackFromPaths(all)])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    out.push({ repo: basename(root), stack, architecture: architectureOf(all) });
  }
  return out;
}

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
