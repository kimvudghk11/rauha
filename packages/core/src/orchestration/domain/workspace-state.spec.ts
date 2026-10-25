import { describe, expect, it } from 'vitest';
import { DomainError } from '../../shared/domain-error.js';
import { WorkspaceState } from './workspace-state.js';

describe('WorkspaceState', () => {
  it('git 저장소가 아니면 시작하지 않는다', () => {
    expect(() => WorkspaceState.of(null).assertReady(true)).toThrow(DomainError);
    expect(() => WorkspaceState.of(null).assertReady(true)).toThrow(/git 저장소/);
  });

  it('커밋하지 않은 변경이 있으면 시작하지 않는다', () => {
    expect(() => WorkspaceState.of(['src/a.ts']).assertReady(true)).toThrow(/src\/a\.ts/);
  });

  it('깨끗한 작업 트리면 시작한다', () => {
    expect(() => WorkspaceState.of([]).assertReady(true)).not.toThrow();
  });

  it('깨끗할 필요가 없으면 변경이 있어도 시작한다', () => {
    expect(() => WorkspaceState.of(['a']).assertReady(false)).not.toThrow();
  });
});

describe('WorkspaceState — 대화 세션에서 이어 일하기', () => {
  const carried = new Map([['src/a.ts', 'h1']]);

  it('세션 중 rauha가 남긴 파일은 그대로면 시작을 막지 않는다', () => {
    expect(() => WorkspaceState.of(['src/a.ts'], carried, new Map([['src/a.ts', 'h1']])).assertReady(true)).not.toThrow();
  });

  it('rauha가 남긴 파일을 직접 고쳤으면 알린다', () => {
    expect(() => WorkspaceState.of(['src/a.ts'], carried, new Map([['src/a.ts', 'h2']])).assertReady(true)).toThrow(/직접 고친/);
  });

  it('세션 전부터 있던 변경은 막는다', () => {
    const current = new Map([['src/a.ts', 'h1'], ['src/b.ts', 'x']]);
    expect(() => WorkspaceState.of(['src/a.ts', 'src/b.ts'], carried, current).assertReady(true)).toThrow(/src\/b\.ts/);
  });
});
