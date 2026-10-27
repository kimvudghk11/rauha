import { describe, expect, it } from 'vitest';
import { continuable, recallBlock, WorkMemory, type MemoryNode } from './work-memory.js';

const work = (over: Partial<Parameters<typeof WorkMemory.fromWork>[0]> = {}) =>
  WorkMemory.fromWork({
    id: 'r1',
    at: '2026-10-25T15:32:00.000Z',
    title: 'Money에 퍼센트 할인 discount 추가',
    request: 'Money에 할인 넣어줘',
    status: 'complete',
    changedFiles: ['src/domain/money.ts', 'src/domain/money.spec.ts'],
    lockedTests: ['src/domain/money.spec.ts'],
    decisions: [{ text: 'Math.floor를 할인 후 금액에 씀 — 정한 해석을 따름', verified: true, rejected: '할인액을 먼저 버림' }],
    assumptions: [{ question: '버림 대상', chosen: '할인 후 금액에서 원 미만 버림 (999원 → 899원)' }],
    extendsWork: null,
    ...over,
  });

const kinds = (nodes: readonly MemoryNode[]) => nodes.map((n) => n.kind).sort();

describe('WorkMemory', () => {
  it('끝난 작업은 작업 점에 바꾼 파일·잠근 테스트·결정·확정 가정을 선으로 잇는다', () => {
    const entry = work();
    expect(kinds(entry.nodes)).toEqual(['assumption', 'decision', 'file', 'file', 'test', 'work']);
    const from = entry.nodes.find((n) => n.kind === 'work')!.id;
    expect(entry.edges.filter((e) => e.from === from).map((e) => e.kind).sort()).toEqual(['assumed', 'changed', 'changed', 'decided', 'tested-by']);
  });

  it('같은 파일은 작업이 달라도 같은 점이다', () => {
    const a = work().nodes.find((n) => n.kind === 'file' && n.text === 'src/domain/money.ts')!;
    const b = work({ id: 'r2' }).nodes.find((n) => n.kind === 'file' && n.text === 'src/domain/money.ts')!;
    expect(a.id).toBe(b.id);
  });

  it('근거 없는 결정은 [추측]으로 남긴다', () => {
    const entry = work({ decisions: [{ text: '응답 필드는 email', verified: false, rejected: null }] });
    expect(entry.nodes.find((n) => n.kind === 'decision')!.text).toBe('[추측] 응답 필드는 email');
  });

  it('멈춘 작업도 남기되 멈췄다고 표시한다', () => {
    expect(work({ status: 'stopped' }).nodes.find((n) => n.kind === 'work')!.text).toContain('(멈춤)');
  });

  it('보충 작업은 원래 작업으로 extends 선을 가진다', () => {
    const entry = work({ id: 'r2', extendsWork: 'work:r1:0' });
    expect(entry.edges).toContainEqual({ from: 'work:r2:0', to: 'work:r1:0', kind: 'extends' });
  });

  it('질문과 답은 답이 인용한 파일로 cites 선을 가진다', () => {
    const entry = WorkMemory.fromAnswer({ id: 'q1', at: '2026-10-25T16:00:00.000Z', question: '왜 floor야?', answer: '정한 해석 때문', citedFiles: ['src/domain/money.ts'] });
    expect(kinds(entry.nodes)).toEqual(['answer', 'file', 'question']);
    expect(entry.edges.map((e) => e.kind).sort()).toEqual(['answered', 'cites']);
  });
});

describe('continuable', () => {
  it('이어서 고칠 수 있는 기억은 작업뿐이다(질문과 답은 뺀다)', () => {
    const node = (id: string, kind: MemoryNode['kind']): MemoryNode => ({ id, kind, text: id, at: '2026-10-25T00:00:00.000Z' });
    const recalls = [{ work: node('q', 'question'), neighbors: [] }, { work: node('w', 'work'), neighbors: [] }];
    expect(continuable(recalls, 3).map((r) => r.work.id)).toEqual(['w']);
  });
});

describe('recallBlock', () => {
  it('기억 묶음은 글자 수 상한 안에서 최근 것부터 자른다', () => {
    const recall = (id: string, at: string) => {
      const entry = work({ id, at, title: `작업 ${id}` });
      return { work: entry.nodes.find((n) => n.kind === 'work')!, neighbors: entry.nodes.filter((n) => n.kind !== 'work') };
    };
    const block = recallBlock([recall('old', '2026-10-01T00:00:00.000Z'), recall('new', '2026-10-25T00:00:00.000Z')], 400);
    expect(block.length).toBeLessThanOrEqual(400);
    expect(block.indexOf('작업 new')).toBeGreaterThanOrEqual(0);
    expect(block.indexOf('작업 new')).toBeLessThan(block.indexOf('작업 old') === -1 ? Infinity : block.indexOf('작업 old'));
  });

  it('작업마다 날짜, 바꾼 파일, 결정, 정한 해석을 짧게 보여 준다', () => {
    const entry = work();
    const block = recallBlock([{ work: entry.nodes.find((n) => n.kind === 'work')!, neighbors: entry.nodes.filter((n) => n.kind !== 'work') }], 2000);
    expect(block).toContain('2026-10-25');
    expect(block).toContain('src/domain/money.ts');
    expect(block).toContain('Math.floor를 할인 후 금액에 씀');
    expect(block).toContain('할인 후 금액에서 원 미만 버림');
  });
});
