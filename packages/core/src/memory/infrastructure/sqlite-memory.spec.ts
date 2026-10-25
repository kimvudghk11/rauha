import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkMemory } from '../domain/work-memory.js';
import { projectMemoryFile, SqliteMemory } from './sqlite-memory.js';

const opened: SqliteMemory[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const m of opened.splice(0)) m.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function memory(dir = mkdtempSync(join(tmpdir(), 'rauha-mem-')), project = 'E:/work/shop'): SqliteMemory {
  if (!dirs.includes(dir)) dirs.push(dir);
  const m = SqliteMemory.open(projectMemoryFile(dir, project));
  opened.push(m);
  return m;
}

const discount = (id = 'r1', at = '2026-10-25T15:32:00.000Z') =>
  WorkMemory.fromWork({
    id,
    at,
    title: 'Money에 퍼센트 할인 discount 추가',
    request: 'Money에 할인 넣어줘',
    status: 'complete',
    changedFiles: ['src/domain/money.ts'],
    lockedTests: ['src/domain/money.spec.ts'],
    decisions: [{ text: 'Math.floor를 할인 후 금액에 씀 — 정한 해석', verified: true, rejected: null }],
    assumptions: [],
    extendsWork: null,
  });

describe('SqliteMemory', () => {
  it('저장한 작업을 단어로 찾고 이웃(파일·결정)을 함께 돌려준다', async () => {
    const m = memory();
    await m.save(discount());
    const [hit] = await m.search('할인 discount', 3);
    expect(hit!.work.id).toBe('work:r1:0');
    expect(hit!.neighbors.map((n) => n.kind).sort()).toEqual(['decision', 'file', 'test']);
  });

  it('결정이나 파일 이름으로 찾아도 그 작업이 나온다', async () => {
    const m = memory();
    await m.save(discount());
    expect((await m.search('Math.floor', 3))[0]?.work.id).toBe('work:r1:0');
    expect((await m.search('money.ts', 3))[0]?.work.id).toBe('work:r1:0');
  });

  it('맞는 것이 없으면 빈 목록', async () => {
    const m = memory();
    await m.save(discount());
    expect(await m.search('쿠폰', 3)).toEqual([]);
  });

  it('다른 프로젝트 파일에 저장한 기억은 찾지 않는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rauha-mem-'));
    await memory(dir, 'E:/work/shop').save(discount());
    expect(await memory(dir, 'E:/work/blog').search('discount', 3)).toEqual([]);
    expect(projectMemoryFile(dir, 'E:\\Work\\Shop')).toBe(projectMemoryFile(dir, 'e:/work/shop'));
  });

  it('같은 점을 두 번 저장해도 하나다', async () => {
    const m = memory();
    await m.save(discount());
    await m.save(discount());
    expect(await m.search('discount', 5)).toHaveLength(1);
  });

  it('여러 작업이 맞으면 최근 작업이 앞에 온다', async () => {
    const m = memory();
    await m.save(discount('old', '2026-10-01T00:00:00.000Z'));
    await m.save(discount('new', '2026-10-25T00:00:00.000Z'));
    expect((await m.search('discount', 5)).map((r) => r.work.id)).toEqual(['work:new:0', 'work:old:0']);
  });

  it('질문과 답도 찾을 수 있다', async () => {
    const m = memory();
    await m.save(WorkMemory.fromAnswer({ id: 'q1', at: '2026-10-25T16:00:00.000Z', question: '왜 floor야?', answer: '정한 해석 때문', citedFiles: [] }));
    expect((await m.search('floor', 3))[0]?.work.kind).toBe('question');
  });
});
