import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { projectKey } from '../../shared/project-key.js';
import type { DesignStorePort } from '../application/design.service.js';

/**
 * 설계 문서를 프로필 폴더 아래 `designs/<저장소 키>/`에 둔다. 회사 저장소의 설계가 다른 프로필과 섞이지 않게
 * 저장소 지식과 같은 규칙이다. 사용자가 읽고 직접 고칠 수 있는 Markdown이다.
 */
export class FileDesignStore implements DesignStorePort {
  constructor(
    private readonly dir: string,
    private readonly projectRoot: string,
  ) {}

  async save(name: string, markdown: string): Promise<string> {
    const folder = join(this.dir, projectKey(this.projectRoot));
    await mkdir(folder, { recursive: true });
    const path = join(folder, basename(name.replace(/\\/g, '/')));
    await writeFile(path, markdown, 'utf8');
    return path.replace(/\\/g, '/');
  }
}
