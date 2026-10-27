import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { projectKey } from '../../shared/project-key.js';
import { RepoKnowledge } from '../domain/repo-knowledge.js';
import { RepoRef } from '../domain/repo-ref.js';
import { FileKnowledgeStore } from './file-knowledge-store.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function knowledgeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rauha-knowledge-'));
  dirs.push(dir);
  return join(dir, 'knowledge');
}

const k = RepoKnowledge.create({
  basis: RepoRef.of({ branch: 'main', commit: 'b'.repeat(40), dirty: false }),
  facts: { totalFiles: 1, dirs: [{ path: '.', files: 1 }], packageManager: null, scripts: {}, instructionFiles: [], testPattern: null },
  symbols: new Map(),
  files: ['a.md'],
});

describe('FileKnowledgeStore', () => {
  it('저장한 지식을 같은 프로젝트에서 되읽는다', async () => {
    const dir = knowledgeDir();
    await new FileKnowledgeStore(dir, 'E:/work/app').save(k);
    expect((await new FileKnowledgeStore(dir, 'e:\\work\\app').load())?.basis.label()).toBe('main (bbbbbbb)');
  });

  it('다른 프로젝트 지식은 읽지 않는다', async () => {
    const dir = knowledgeDir();
    await new FileKnowledgeStore(dir, 'E:/work/app').save(k);
    expect(await new FileKnowledgeStore(dir, 'E:/work/other').load()).toBeNull();
  });

  it('없거나 깨졌으면 null', async () => {
    const dir = knowledgeDir();
    const store = new FileKnowledgeStore(dir, 'E:/work/app');
    expect(await store.load()).toBeNull();
    await store.save(k);
    writeFileSync(join(dir, `${projectKey('E:/work/app')}.json`), '{ 깨짐');
    expect(await store.load()).toBeNull();
  });
});
