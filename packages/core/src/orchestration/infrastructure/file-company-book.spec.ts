import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CompanyBook } from '../domain/company-book.js';
import { FileCompanyBook } from './file-company-book.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'rauha-company-'));
  dirs.push(d);
  return d;
};

describe('FileCompanyBook', () => {
  it('저장한 장부를 다시 읽는다', async () => {
    const store = new FileCompanyBook(tmp(), 'E:/work/app');
    await store.save(CompanyBook.empty().with({ department: 'design', summary: '따뜻한 톤', at: '2026-11-01T00:00:00.000Z' }));
    expect((await store.load()).entries).toEqual([{ department: 'design', summary: '따뜻한 톤', at: '2026-11-01T00:00:00.000Z' }]);
  });

  it('아직 없으면 빈 장부다', async () => {
    expect((await new FileCompanyBook(tmp(), 'E:/work/app').load()).entries).toEqual([]);
  });

  it('저장소마다 따로 둔다', async () => {
    const dir = tmp();
    await new FileCompanyBook(dir, 'E:/work/a').save(CompanyBook.empty().with({ department: 'planning', summary: 'A', at: '2026-11-01T00:00:00.000Z' }));
    expect((await new FileCompanyBook(dir, 'E:/work/b').load()).entries).toEqual([]);
  });

  it('깨진 파일은 빈 장부로 읽는다 (대화를 막지 않는다)', async () => {
    const dir = tmp();
    const store = new FileCompanyBook(dir, 'E:/work/app');
    await store.save(CompanyBook.empty());
    const { readdirSync } = await import('node:fs');
    writeFileSync(join(dir, readdirSync(dir)[0]!), '{not json');
    expect((await store.load()).entries).toEqual([]);
  });
});
