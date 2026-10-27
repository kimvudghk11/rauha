import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectKey } from '../../shared/project-key.js';
import { RepoKnowledgeDto } from '../application/dto/repo-knowledge.dto.js';
import type { RepoKnowledge } from '../domain/repo-knowledge.js';

/** 프로젝트마다 저장소 지식 하나를 `<dir>/<프로젝트 키>.json`에 둔다(저장소 안에는 파일을 만들지 않는다). */
export class FileKnowledgeStore {
  private readonly file: string;

  constructor(
    private readonly dir: string,
    projectRoot: string,
  ) {
    this.file = join(dir, `${projectKey(projectRoot)}.json`);
  }

  /** 없거나 깨졌거나 옛 형식이면 null(처음부터 다시 만든다). */
  async load(): Promise<RepoKnowledge | null> {
    try {
      return RepoKnowledgeDto.from(JSON.parse(await readFile(this.file, 'utf8')))?.toEntity() ?? null;
    } catch {
      return null;
    }
  }

  /** 임시 파일에 쓴 뒤 이름을 바꾼다. 쓰다가 끊겨도 반쪽 파일이 남지 않게. */
  async save(knowledge: RepoKnowledge): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const temp = `${this.file}.${process.pid}.tmp`;
    await writeFile(temp, RepoKnowledgeDto.fromEntity(knowledge).toJson(), 'utf8');
    await rename(temp, this.file);
  }
}
