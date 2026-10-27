import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectKey } from '../../shared/project-key.js';

export interface SavedWorkspace {
  /** /repo add로 더한 저장소 */
  readonly extra: readonly string[];
  /** 마지막 지금 저장소 */
  readonly current: string | null;
}

const isString = (v: unknown): v is string => typeof v === 'string';

/** 띄운 폴더마다 작업 공간에 더한 저장소와 마지막 지금 저장소를 `<dir>/<폴더 키>.json`에 둔다. */
export class FileWorkspaceStore {
  private readonly file: string;

  constructor(
    private readonly dir: string,
    launchDir: string,
  ) {
    this.file = join(dir, `${projectKey(launchDir)}.json`);
  }

  /** 없거나 깨졌으면 null */
  async load(): Promise<SavedWorkspace | null> {
    try {
      const o = JSON.parse(await readFile(this.file, 'utf8')) as Record<string, unknown>;
      const extra = o['extra'];
      const current = o['current'];
      if (!Array.isArray(extra) || !extra.every(isString) || !(current === null || isString(current))) return null;
      return { extra, current };
    } catch {
      return null;
    }
  }

  async save(saved: SavedWorkspace): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const temp = `${this.file}.${process.pid}.tmp`;
    await writeFile(temp, `${JSON.stringify({ extra: saved.extra, current: saved.current })}\n`, 'utf8');
    await rename(temp, this.file);
  }
}
