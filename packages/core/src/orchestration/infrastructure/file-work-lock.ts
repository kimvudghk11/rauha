import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { toPosixPath } from '../../shared/path-pattern.js';
import type { HeldLock, WorkLockPort } from '../application/ports.js';

/** 프로젝트마다 다른 잠금 파일. 경로 표기(대소문자, \ 와 /) 차이는 같은 프로젝트로 본다. 프로필이 달라도 같은 폴더면 같은 잠금이다. */
export function projectLockFile(locksDir: string, projectRoot: string): string {
  const key = createHash('sha256').update(toPosixPath(projectRoot).toLowerCase()).digest('hex').slice(0, 12);
  return join(locksDir, `${key}.lock`);
}

/** 그 프로세스가 아직 살아 있는지. 권한이 없어 확인을 거절당해도 살아 있는 것이다. */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * 한 폴더에서는 한 번에 작업 하나. 잠금 파일에 잡은 rauha의 프로세스 번호를 적고,
 * 그 프로세스가 죽었으면(강제 종료 등) 남은 잠금으로 보고 치운다.
 */
export class FileWorkLock implements WorkLockPort {
  constructor(
    private readonly file: string,
    private readonly pid: number = process.pid,
    private readonly isAlive: (pid: number) => boolean = processAlive,
  ) {}

  async acquire(): Promise<HeldLock | null> {
    await mkdir(dirname(this.file), { recursive: true });
    // 남은 잠금을 치운 직후 다른 rauha가 먼저 잡을 수 있어서 한 번만 더 해 본다.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await writeFile(this.file, String(this.pid), { flag: 'wx' });
        return { release: () => rm(this.file, { force: true }) };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const holder = Number((await readFile(this.file, 'utf8').catch(() => '')).trim());
        if (Number.isInteger(holder) && holder > 0 && this.isAlive(holder)) return null;
        await rm(this.file, { force: true });
      }
    }
    return null;
  }
}
