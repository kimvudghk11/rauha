import { describe, expect, it } from 'vitest';
import { RepoRef } from './repo-ref.js';

const commit = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

describe('RepoRef', () => {
  it('브랜치와 짧은 커밋으로 기준을 밝힌다', () => {
    expect(RepoRef.of({ branch: 'main', commit, dirty: false }).label()).toBe('main (a1b2c3d)');
  });

  it('브랜치가 없으면(detached) 커밋만', () => {
    expect(RepoRef.of({ branch: null, commit, dirty: false }).label()).toBe('a1b2c3d');
  });

  it('커밋하지 않은 변경이 있으면 함께 밝힌다', () => {
    expect(RepoRef.of({ branch: 'main', commit, dirty: true }).label()).toBe('main (a1b2c3d) + 작업 트리 변경');
  });
});
