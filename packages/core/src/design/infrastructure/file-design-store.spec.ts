import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { projectKey } from '../../shared/project-key.js';
import { FileDesignStore } from './file-design-store.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'rauha-designs-'));
  dirs.push(d);
  return d;
};

describe('FileDesignStore', () => {
  it('설계 문서를 저장소 키 폴더 아래에 저장하고 경로를 돌려준다', async () => {
    const dir = tmp();
    const path = await new FileDesignStore(dir, 'E:/work/shop-api').save('2026-10-29-쿠폰.md', '# 쿠폰');
    expect(path).toContain(projectKey('E:/work/shop-api'));
    expect(path.endsWith('2026-10-29-쿠폰.md')).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe('# 쿠폰');
  });

  it('같은 이름으로 다시 저장하면 덮어쓴다 (고쳐 쓴 설계안)', async () => {
    const store = new FileDesignStore(tmp(), 'E:/work/shop-api');
    await store.save('a.md', 'v1');
    const path = await store.save('a.md', 'v2');
    expect(readFileSync(path, 'utf8')).toBe('v2');
  });

  it('폴더를 벗어나는 이름은 파일 이름만 쓴다', async () => {
    const dir = tmp();
    const path = await new FileDesignStore(dir, 'E:/work/shop-api').save('../../evil.md', 'x');
    expect(path.replace(/\\/g, '/')).toContain(`${dir.replace(/\\/g, '/')}/`);
    expect(path.endsWith('evil.md')).toBe(true);
  });
});
