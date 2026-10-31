import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LearningBook } from '../domain/learning-book.js';
import { FileLearningStore } from './file-learning-store.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'rauha-learning-'));
  dirs.push(d);
  return d;
};
const book = () => LearningBook.empty().add([{ pattern: '전략(Strategy)', what: 'A', why: 'B', at: '2026-11-01T00:00:00.000Z' }]);

describe('FileLearningStore', () => {
  it('저장한 노트를 다시 읽는다', async () => {
    const store = new FileLearningStore(tmp(), 'E:/work/app');
    await store.save(book());
    expect((await store.load()).notes).toEqual(book().notes);
  });

  it('아직 없으면 빈 노트다', async () => {
    expect((await new FileLearningStore(tmp(), 'E:/work/app').load()).notes).toEqual([]);
  });

  it('저장소마다 따로 둔다', async () => {
    const dir = tmp();
    await new FileLearningStore(dir, 'E:/work/a').save(book());
    expect((await new FileLearningStore(dir, 'E:/work/b').load()).notes).toEqual([]);
  });
});
