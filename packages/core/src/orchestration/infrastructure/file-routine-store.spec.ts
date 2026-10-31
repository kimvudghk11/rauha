import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Routine, RoutineBook } from '../domain/routine.js';
import { FileRoutineStore } from './file-routine-store.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'rauha-routine-'));
  dirs.push(d);
  return d;
};
const book = () => RoutineBook.empty().add(Routine.create({ id: 'r1', request: '주간 점검', cadence: { kind: 'weekly', weekday: 1 }, today: '2026-11-01' }));

describe('FileRoutineStore', () => {
  it('저장한 정기 업무를 다시 읽는다', async () => {
    const store = new FileRoutineStore(tmp(), 'E:/work/app');
    await store.save(book());
    expect((await store.load()).toJSON()).toEqual(book().toJSON());
  });

  it('아직 없으면 빈 목록이다', async () => {
    expect((await new FileRoutineStore(tmp(), 'E:/work/app').load()).routines).toEqual([]);
  });

  it('저장소마다 따로 둔다', async () => {
    const dir = tmp();
    await new FileRoutineStore(dir, 'E:/work/a').save(book());
    expect((await new FileRoutineStore(dir, 'E:/work/b').load()).routines).toEqual([]);
  });
});
