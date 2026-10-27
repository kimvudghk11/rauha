import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listSecretFiles, loadSecretPolicy } from './load-secret-policy.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rauha-secrets-'));
  dirs.push(dir);
  execFileSync('git', ['init', '-q'], { cwd: dir });
  mkdirSync(join(dir, 'packages', 'api', 'config'), { recursive: true });
  return dir;
}

describe('loadSecretPolicy', () => {
  it('하위 폴더에서 띄워도 저장소 루트의 .rauhaignore를 루트 기준 경로로 적용한다', () => {
    const dir = repo();
    writeFileSync(join(dir, '.rauhaignore'), 'packages/api/config/prod.json\n');
    const policy = loadSecretPolicy(join(dir, 'packages', 'api'));
    expect(policy.isSecret('config/prod.json')).toBe(true);
    expect(policy.isSecret('config/dev.json')).toBe(false);
  });
});

describe('listSecretFiles', () => {
  it('작업 폴더 아래 검색에 걸릴 수 있는 비밀 파일을 작업 폴더 기준 경로로 찾는다', () => {
    const dir = repo();
    writeFileSync(join(dir, '.rauhaignore'), 'packages/api/config/prod.json\n');
    writeFileSync(join(dir, 'packages', 'api', 'config', 'prod.json'), '{}');
    writeFileSync(join(dir, 'packages', 'api', 'index.ts'), '');
    const root = join(dir, 'packages', 'api');
    expect(listSecretFiles(root, loadSecretPolicy(root))).toEqual(['config/prod.json']);
  });
});
