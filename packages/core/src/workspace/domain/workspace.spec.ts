import { describe, expect, it } from 'vitest';
import { Workspace } from './workspace.js';

const roots = ['E:/work/shop-api', 'E:/work/shop-web', 'E:/work/api'];

describe('Workspace', () => {
  it('메시지에 나온 저장소 이름으로 고른다(한글 조사는 붙어도 된다)', () => {
    const ws = Workspace.of(roots);
    expect(ws.pick('shop-api에서 Money 설명해줘')).toMatchObject({ kind: 'one', repo: { name: 'shop-api' } });
    expect(ws.pick('API 저장소 구조 알려줘')).toMatchObject({ kind: 'one', repo: { name: 'api' } });
  });

  it('다른 말의 일부인 이름은 잡지 않는다', () => {
    const ws = Workspace.of(roots);
    expect(ws.mentioned('rapid하게 해줘').map((r) => r.name)).toEqual([]);
    expect(ws.mentioned('apis 목록').map((r) => r.name)).toEqual([]);
    // shop-api 안의 api는 별개 저장소로 잡지 않는다.
    expect(ws.mentioned('shop-api 고쳐줘').map((r) => r.name)).toEqual(['shop-api']);
  });

  it('두 저장소를 말하면 둘 다, 나온 순서대로', () => {
    const pick = Workspace.of(roots).pick('shop-web과 shop-api의 차이');
    expect(pick.kind).toBe('many');
    if (pick.kind === 'many') expect(pick.repos.map((r) => r.name)).toEqual(['shop-web', 'shop-api']);
  });

  it('"모든 레포"·"전체 저장소"처럼 전부를 말하면 모든 저장소를, 지금 저장소부터', () => {
    for (const message of ['모든 레포에서 내 커밋 모아줘', '전체 저장소 README 정리해줘', '레포 전부 훑어봐', 'all repos 요약']) {
      const pick = Workspace.of(roots, 'E:/work/shop-web').pick(message);
      expect(pick.kind).toBe('many');
      if (pick.kind === 'many') expect(pick.repos.map((r) => r.name)).toEqual(['shop-web', 'shop-api', 'api']);
    }
  });

  it('이름이 없으면 지금 저장소, 지금 저장소가 없고 여럿이면 묻는다', () => {
    expect(Workspace.of(roots).pick('이거 고쳐줘').kind).toBe('ask');
    expect(Workspace.of(roots, 'E:/work/shop-web').pick('이거 고쳐줘')).toMatchObject({ kind: 'one', repo: { name: 'shop-web' } });
  });

  it('저장소가 하나면 묻지 않는다', () => {
    expect(Workspace.of(['E:/work/only']).pick('이거 고쳐줘')).toMatchObject({ kind: 'one', repo: { name: 'only' } });
  });

  it('고른 저장소가 다음 지금 저장소가 된다', () => {
    const ws = Workspace.of(roots);
    ws.pick('shop-api 설명');
    expect(ws.current()?.name).toBe('shop-api');
    ws.pick('shop-web과 api 비교');
    expect(ws.current()?.name).toBe('shop-web');
    expect(ws.select('api')?.name).toBe('api');
    expect(ws.current()?.name).toBe('api');
    expect(ws.select('없는것')).toBeNull();
  });

  it('같은 폴더 이름은 부모 폴더를 붙여 구분한다', () => {
    const ws = Workspace.of(['E:/work/a/api', 'E:/work/b/api', 'E:/work/web']);
    expect(ws.repos.map((r) => r.name)).toEqual(['a/api', 'b/api', 'web']);
    expect(ws.pick('b/api 고쳐줘')).toMatchObject({ kind: 'one', repo: { root: 'E:/work/b/api' } });
  });

  it('경로 표기가 달라도 같은 저장소는 한 번만 더한다', () => {
    const ws = Workspace.of(['E:/work/shop-api']);
    ws.add('e:\\work\\shop-api\\');
    ws.add('E:/work/new');
    expect(ws.repos.map((r) => r.name)).toEqual(['shop-api', 'new']);
  });
});
