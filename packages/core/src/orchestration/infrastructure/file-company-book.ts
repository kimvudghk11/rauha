import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectKey } from '../../shared/project-key.js';
import { CompanyBook } from '../domain/company-book.js';
import type { CompanyBookPort } from '../application/ports.js';

/**
 * 회사 장부를 프로필 폴더 아래 `company/<저장소 키>.json`에 둔다. 회사 저장소의 결정이 다른 프로필과 섞이거나
 * 저장소 안(커밋될 곳)에 쓰이지 않게 하는 저장소 지식·설계 문서와 같은 규칙이다.
 */
export class FileCompanyBook implements CompanyBookPort {
  constructor(
    private readonly dir: string,
    private readonly projectRoot: string,
  ) {}

  private file(): string {
    return join(this.dir, `${projectKey(this.projectRoot)}.json`);
  }

  async load(): Promise<CompanyBook> {
    try {
      return CompanyBook.read(JSON.parse(await readFile(this.file(), 'utf8')));
    } catch {
      return CompanyBook.empty();
    }
  }

  async save(book: CompanyBook): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.file(), JSON.stringify(book.entries, null, 2), 'utf8');
  }
}
