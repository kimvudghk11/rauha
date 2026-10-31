import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectKey } from '../../shared/project-key.js';
import { RoutineBook } from '../domain/routine.js';

/** 정기 업무를 프로필 폴더 아래 `routines/<저장소 키>.json`에 둔다. 저장소마다 따로, 회사/개인 프로필끼리 섞이지 않게. */
export class FileRoutineStore {
  constructor(
    private readonly dir: string,
    private readonly projectRoot: string,
  ) {}

  private file(): string {
    return join(this.dir, `${projectKey(this.projectRoot)}.json`);
  }

  async load(): Promise<RoutineBook> {
    try {
      return RoutineBook.read(JSON.parse(await readFile(this.file(), 'utf8')));
    } catch {
      return RoutineBook.empty();
    }
  }

  async save(book: RoutineBook): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.file(), JSON.stringify(book.toJSON(), null, 2), 'utf8');
  }
}
