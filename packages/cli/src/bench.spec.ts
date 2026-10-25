import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { benchCopyDir, freshSandbox } from './bench.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('bench 연습용 복사본', () => {
  it('복사본은 rauha 저장소 밖(임시 폴더)에 둔다 — rauha의 CLAUDE.md를 물려받지 않게', () => {
    const dir = benchCopyDir('20261025-140000', 'discount').replace(/\\/g, '/');
    expect(dir.startsWith(tmpdir().replace(/\\/g, '/'))).toBe(true);
    expect(dir).toMatch(/rauha-bench\/20261025-140000\/discount$/);
  });

  it('새 복사본은 깨끗한 git 출발점이고 rauha의 node_modules를 연결해 쓴다', async () => {
    const work = mkdtempSync(join(tmpdir(), 'rauha-bench-spec-'));
    dirs.push(work);
    const source = join(work, 'src-project');
    const modules = join(work, 'modules');
    mkdirSync(source);
    mkdirSync(join(modules, 'fake-lib'), { recursive: true });
    writeFileSync(join(source, 'a.ts'), 'a');
    writeFileSync(join(source, '.gitignore'), 'node_modules/\n');
    writeFileSync(join(modules, 'fake-lib', 'index.js'), '');

    const target = join(work, 'copy');
    await freshSandbox(source, target, modules);

    expect(existsSync(join(target, 'node_modules', 'fake-lib', 'index.js'))).toBe(true);
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: target }).toString()).toBe('');
  });
});
