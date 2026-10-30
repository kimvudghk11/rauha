import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { InputHistoryFile } from './input-history.js';

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
async function file() {
  const dir = await mkdtemp(join(tmpdir(), 'rauha-history-'));
  dirs.push(dir);
  return new InputHistoryFile(join(dir, 'sub', 'history.txt'));
}

describe('InputHistoryFile', () => {
  it('남긴 입력을 순서대로 다시 불러온다', async () => {
    const history = await file();
    await history.append('첫째');
    await history.append('둘째');
    expect(await history.load()).toEqual(['첫째', '둘째']);
  });

  it('파일이 없으면 빈 기록이다', async () => {
    expect(await (await file()).load()).toEqual([]);
  });

  it('여러 줄 글은 한 줄로 합치고 빈 글은 남기지 않는다', async () => {
    const history = await file();
    await history.append('가\n나');
    await history.append('  ');
    expect(await history.load()).toEqual(['가 나']);
  });

  it('최근 200개만 불러온다', async () => {
    const history = await file();
    for (let i = 0; i < 205; i++) await history.append(`입력 ${i}`);
    const loaded = await history.load();
    expect(loaded).toHaveLength(200);
    expect(loaded[0]).toBe('입력 5');
  });
});
