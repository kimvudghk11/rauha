import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { projectKey } from '../../shared/project-key.js';
import { FileWorkspaceStore } from './file-workspace-store.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function storeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rauha-wsstore-'));
  dirs.push(dir);
  return join(dir, 'workspaces');
}

describe('FileWorkspaceStore', () => {
  it('더한 저장소와 지금 저장소를 띄운 폴더마다 기억한다', async () => {
    const dir = storeDir();
    await new FileWorkspaceStore(dir, 'E:/work').save({ extra: ['E:/other/lib'], current: 'E:/work/api' });
    expect(await new FileWorkspaceStore(dir, 'e:\\work').load()).toEqual({ extra: ['E:/other/lib'], current: 'E:/work/api' });
    expect(await new FileWorkspaceStore(dir, 'E:/elsewhere').load()).toBeNull();
  });

  it('깨졌으면 null', async () => {
    const dir = storeDir();
    const store = new FileWorkspaceStore(dir, 'E:/work');
    await store.save({ extra: [], current: null });
    writeFileSync(join(dir, `${projectKey('E:/work')}.json`), '{"extra": 3}');
    expect(await store.load()).toBeNull();
  });
});
