import { RepoKnowledge, type AreaNote, type RepoFacts } from '../../domain/repo-knowledge.js';
import { RepoRef } from '../../domain/repo-ref.js';

interface KnowledgeJson {
  readonly version: 1;
  readonly basis: { readonly branch: string | null; readonly commit: string; readonly dirty: boolean };
  readonly facts: RepoFacts;
  readonly symbols: readonly (readonly [string, readonly string[]])[];
  readonly files: readonly string[];
  readonly notes: readonly AreaNote[];
  readonly stale: readonly string[];
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function readFacts(v: unknown): RepoFacts | null {
  if (!isRecord(v)) return null;
  const dirs = v['dirs'];
  const scripts = v['scripts'];
  const validDirs = Array.isArray(dirs) && dirs.every((d) => isRecord(d) && isString(d['path']) && typeof d['files'] === 'number');
  const validScripts = isRecord(scripts) && Object.values(scripts).every(isString);
  if (typeof v['totalFiles'] !== 'number' || !validDirs || !validScripts || !isStringList(v['instructionFiles'])) return null;
  if (!(v['packageManager'] === null || isString(v['packageManager'])) || !(v['testPattern'] === null || isString(v['testPattern']))) return null;
  return {
    totalFiles: v['totalFiles'],
    dirs: (dirs as { path: string; files: number }[]).map((d) => ({ path: d.path, files: d.files })),
    packageManager: v['packageManager'] as string | null,
    scripts: scripts as Record<string, string>,
    instructionFiles: v['instructionFiles'],
    testPattern: v['testPattern'] as string | null,
  };
}

/**
 * 저장소 지식 ↔ 파일(JSON). 파일은 rauha 밖에서 바뀌거나 옛 형식일 수 있어서,
 * 모양이 하나라도 틀리면 던지지 않고 null을 돌려준다(처음부터 다시 만들면 그만이라서).
 */
export class RepoKnowledgeDto {
  private constructor(private readonly json: KnowledgeJson) {}

  static fromEntity(k: RepoKnowledge): RepoKnowledgeDto {
    return new RepoKnowledgeDto({
      version: 1,
      basis: { branch: k.basis.branch, commit: k.basis.commit, dirty: k.basis.dirty },
      facts: k.facts,
      symbols: [...k.symbols.entries()],
      files: k.files,
      notes: k.notes,
      stale: k.stale,
    });
  }

  static from(input: unknown): RepoKnowledgeDto | null {
    if (!isRecord(input) || input['version'] !== 1) return null;
    const basis = input['basis'];
    if (!isRecord(basis) || !isString(basis['commit']) || typeof basis['dirty'] !== 'boolean' || !(basis['branch'] === null || isString(basis['branch']))) return null;
    const facts = readFacts(input['facts']);
    const symbols = input['symbols'];
    const notes = input['notes'];
    const validSymbols = Array.isArray(symbols) && symbols.every((s) => Array.isArray(s) && s.length === 2 && isString(s[0]) && isStringList(s[1]));
    const validNotes = Array.isArray(notes) && notes.every((n) => isRecord(n) && isString(n['area']) && isString(n['text']) && isStringList(n['sources']));
    if (facts === null || !validSymbols || !validNotes || !isStringList(input['files']) || !isStringList(input['stale'])) return null;
    return new RepoKnowledgeDto({
      version: 1,
      basis: { branch: basis['branch'] as string | null, commit: basis['commit'], dirty: basis['dirty'] },
      facts,
      symbols: (symbols as [string, string[]][]).map(([path, names]) => [path, names] as const),
      files: input['files'],
      notes: (notes as AreaNote[]).map((n) => ({ area: n.area, text: n.text, sources: n.sources })),
      stale: input['stale'],
    });
  }

  toEntity(): RepoKnowledge {
    const j = this.json;
    return RepoKnowledge.restore({ basis: RepoRef.of(j.basis), facts: j.facts, symbols: new Map(j.symbols), files: j.files, notes: j.notes, stale: j.stale });
  }

  toJson(): string {
    return `${JSON.stringify(this.json)}\n`;
  }
}
