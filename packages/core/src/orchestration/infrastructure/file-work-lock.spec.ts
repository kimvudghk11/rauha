import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileWorkLock, projectLockFile } from './file-work-lock.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function lockFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rauha-lock-'));
  dirs.push(dir);
  return join(dir, 'locks', 'p.lock');
}

describe('FileWorkLock', () => {
  it('비어 있으면 잡고, 놓으면 파일이 사라진다', async () => {
    const file = lockFile();
    const held = await new FileWorkLock(file, 100, () => true).acquire();
    expect(held).not.toBeNull();
    expect(existsSync(file)).toBe(true);
    await held!.release();
    expect(existsSync(file)).toBe(false);
  });

  it('살아 있는 다른 rauha가 잡고 있으면 잡지 못한다', async () => {
    const file = lockFile();
    await new FileWorkLock(file, 100, () => true).acquire();
    expect(await new FileWorkLock(file, 200, () => true).acquire()).toBeNull();
  });

  it('잡은 rauha가 죽었으면 남은 잠금을 치우고 잡는다', async () => {
    const file = lockFile();
    await new FileWorkLock(file, 100, () => true).acquire();
    const held = await new FileWorkLock(file, 200, (pid) => pid !== 100).acquire();
    expect(held).not.toBeNull();
  });

  it('내용이 깨진 잠금 파일은 남은 것으로 보고 치운다', async () => {
    const file = lockFile();
    await new FileWorkLock(file, 100, () => true).acquire();
    writeFileSync(file, 'garbage');
    expect(await new FileWorkLock(file, 200, () => true).acquire()).not.toBeNull();
  });

  it('같은 프로젝트는 경로 표기가 달라도 같은 잠금 파일을 쓴다', () => {
    expect(projectLockFile('/locks', 'E:\\Work\\App')).toBe(projectLockFile('/locks', 'e:/work/app'));
    expect(projectLockFile('/locks', 'e:/work/app')).not.toBe(projectLockFile('/locks', 'e:/work/app-2'));
  });
});
