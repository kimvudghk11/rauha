import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { relativeToRoot } from '../../shared/path-pattern.js';
import { RauhaIgnoreDto } from '../application/dto/rauha-ignore.dto.js';
import type { SecretPolicy } from '../domain/secret-policy.js';

function git(cwd: string, args: readonly string[]): string | null {
  try {
    return execFileSync('git', ['-c', 'core.quotepath=false', ...args], { cwd, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 }).toString();
  } catch {
    return null;
  }
}

/**
 * 비밀 파일 규칙. `.rauhaignore`는 저장소 루트에서 읽고(하위 폴더에서 띄워도), 루트 기준 줄이
 * 작업 폴더 기준 경로에 맞도록 루트 → 작업 폴더 경로를 함께 넘긴다. git 저장소가 아니면 작업 폴더를 루트로 본다.
 */
export function loadSecretPolicy(workDir: string): SecretPolicy {
  const top = git(workDir, ['rev-parse', '--show-toplevel'])?.trim() || workDir;
  const base = relativeToRoot(top, workDir) ?? '';
  let text: string | null = null;
  try {
    text = readFileSync(join(top, '.rauhaignore'), 'utf8');
  } catch {
    text = null;
  }
  return RauhaIgnoreDto.from(text).toEntity(base);
}

/**
 * 작업 폴더 아래 비밀 파일 중 검색 도구가 실제로 열 수 있는 것(추적 중 + 무시되지 않은 새 파일), 작업 폴더 기준.
 * 비밀 파일이 있는 폴더를 내용으로 통째로 검색하는 것을 막는 데 쓴다.
 */
export function listSecretFiles(workDir: string, policy: SecretPolicy): string[] {
  const out = git(workDir, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.']) ?? '';
  return [...new Set(out.split('\0'))].filter((p) => p !== '' && !/(^|\/)node_modules\//.test(p) && policy.isSecret(p)).sort();
}
