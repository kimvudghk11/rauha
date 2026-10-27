import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectKey } from '../../shared/project-key.js';
import { ChatSnapshotDto, type ChatSnapshot } from '../application/dto/chat-snapshot.dto.js';

/** 프로젝트마다 마지막 대화 하나를 `<dir>/<프로젝트 키>.json`에 둔다(rauha --continue용). */
export class FileChatSnapshots {
  private readonly file: string;

  constructor(
    private readonly dir: string,
    projectRoot: string,
  ) {
    this.file = join(dir, `${projectKey(projectRoot)}.json`);
  }

  /** 임시 파일에 쓴 뒤 이름을 바꾼다. 쓰다가 끊겨도 반쪽 파일이 남지 않게. */
  async save(snapshot: ChatSnapshot): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const temp = `${this.file}.${process.pid}.tmp`;
    await writeFile(temp, ChatSnapshotDto.of(snapshot).toJson(), 'utf8');
    await rename(temp, this.file);
  }

  /** 없거나 깨졌거나 옛 형식이면 null(새 대화로 시작한다). */
  async load(): Promise<ChatSnapshot | null> {
    try {
      return ChatSnapshotDto.from(JSON.parse(await readFile(this.file, 'utf8')))?.value ?? null;
    } catch {
      return null;
    }
  }
}
