import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChatSnapshot } from '../application/dto/chat-snapshot.dto.js';
import { projectKey } from '../../shared/project-key.js';
import { FileChatSnapshots } from './file-chat-snapshots.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function sessionsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rauha-sessions-'));
  dirs.push(dir);
  return join(dir, 'sessions');
}

const snapshot: ChatSnapshot = { version: 1, turns: [{ input: '안녕', result: '답: 안녕하세요.' }], carried: [], lastTitle: null, savedAt: '2026-10-27T10:00:00.000Z' };

describe('FileChatSnapshots', () => {
  it('저장한 대화를 같은 프로젝트에서 되읽는다', async () => {
    const dir = sessionsDir();
    await new FileChatSnapshots(dir, 'E:/work/app').save(snapshot);
    expect(await new FileChatSnapshots(dir, 'e:\\work\\app').load()).toEqual(snapshot);
  });

  it('다른 프로젝트 대화는 읽지 않는다', async () => {
    const dir = sessionsDir();
    await new FileChatSnapshots(dir, 'E:/work/app').save(snapshot);
    expect(await new FileChatSnapshots(dir, 'E:/work/other').load()).toBeNull();
  });

  it('파일이 없거나 깨졌으면 null', async () => {
    const dir = sessionsDir();
    const store = new FileChatSnapshots(dir, 'E:/work/app');
    expect(await store.load()).toBeNull();
    await store.save(snapshot);
    writeFileSync(join(dir, `${projectKey('E:/work/app')}.json`), '{ 깨짐');
    expect(await store.load()).toBeNull();
  });
});
