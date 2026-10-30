import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** 파일에 남겨 두고 다시 불러오는 입력 기록 수 */
const KEEP = 200;

/**
 * 보낸 입력을 파일에 한 줄씩 남겨, 다음에 rauha를 열어도 위 화살표로 부를 수 있게 한다(Claude Code·Kiro처럼).
 * 기록은 덤이라서 읽기·쓰기에 실패해도 대화를 막지 않는다.
 */
export class InputHistoryFile {
  constructor(private readonly path: string) {}

  /** 마지막 KEEP개. 파일이 없거나 읽지 못하면 빈 목록. */
  async load(): Promise<string[]> {
    try {
      const lines = (await readFile(this.path, 'utf8')).split('\n').filter((l) => l !== '');
      return lines.slice(-KEEP);
    } catch {
      return [];
    }
  }

  async append(text: string): Promise<void> {
    // 한 줄에 하나씩 남기므로 줄바꿈은 공백으로 바꾼다.
    const line = text.replace(/[\r\n]+/g, ' ').trim();
    if (line === '') return;
    try {
      await mkdir(dirname(this.path), { recursive: true });
      await appendFile(this.path, `${line}\n`, 'utf8');
    } catch {
      // 기록을 못 남겨도 대화는 계속한다.
    }
  }
}
