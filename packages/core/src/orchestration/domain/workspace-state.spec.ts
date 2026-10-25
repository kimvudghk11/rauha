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
