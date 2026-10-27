import { describe, expect, it } from 'vitest';
import { RepoKnowledge } from '../../domain/repo-knowledge.js';
import { RepoRef } from '../../domain/repo-ref.js';
import { RepoKnowledgeDto } from './repo-knowledge.dto.js';

function sample(): RepoKnowledge {
  const k = RepoKnowledge.create({
    basis: RepoRef.of({ branch: 'main', commit: 'a'.repeat(40), dirty: true }),
    facts: { totalFiles: 2, dirs: [{ path: 'src', files: 2 }], packageManager: 'yarn', scripts: { test: 'vitest run' }, instructionFiles: [], testPattern: null },
    symbols: new Map([['src/a.ts', ['A']]]),
    files: ['src/a.ts', 'src/b.json'],
  });
  k.writeNotes([{ area: 'src', text: '메모', sources: ['src/a.ts'] }]);
  // 새 파일이 생겨 영역이 낡음으로 표시된 상태까지 저장되는지 본다.
  k.applyChanges({ basis: k.basis, facts: k.facts, changed: new Map([['src/c.ts', ['C']]]), hashes: new Map([['src/c.ts', 'h3']]) });
  return k;
}

describe('RepoKnowledgeDto', () => {
  it('저장한 지식을 그대로 되읽는다(낡음 표시 포함)', () => {
    const k = sample();
    const back = RepoKnowledgeDto.from(JSON.parse(RepoKnowledgeDto.fromEntity(k).toJson()))!.toEntity();
    expect(back.basis.label()).toBe(k.basis.label());
    expect(back.facts).toEqual(k.facts);
    expect([...back.symbols]).toEqual([...k.symbols]);
    expect(back.files).toEqual(k.files);
    expect(back.notes).toEqual(k.notes);
    expect(back.staleAreas()).toEqual(['src']);
  });

  it('깨졌거나 옛 형식이면 null', () => {
    const good = JSON.parse(RepoKnowledgeDto.fromEntity(sample()).toJson()) as Record<string, unknown>;
    for (const bad of [null, 'x', { ...good, version: 2 }, { ...good, basis: { commit: 3 } }, { ...good, symbols: 'x' }, { ...good, notes: [{ area: 1 }] }]) {
      expect(RepoKnowledgeDto.from(bad)).toBeNull();
    }
  });
});
