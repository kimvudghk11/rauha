import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectKey } from '../../shared/project-key.js';
import { LearningBook } from '../domain/learning-book.js';
import type { LearningPort } from '../application/ports.js';

/** 학습 노트를 프로필 폴더 아래 `learning/<저장소 키>.json`에 둔다. 저장소마다 따로, 프로필끼리 섞이지 않게. */
export class FileLearningStore implements LearningPort {
  constructor(
    private readonly dir: string,
    private readonly projectRoot: string,
  ) {}

  private file(): string {
    return join(this.dir, `${projectKey(this.projectRoot)}.json`);
  }

  async load(): Promise<LearningBook> {
    try {
      return LearningBook.read(JSON.parse(await readFile(this.file(), 'utf8')));
    } catch {
      return LearningBook.empty();
    }
  }

  async save(book: LearningBook): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.file(), JSON.stringify(book.notes, null, 2), 'utf8');
  }
}
