import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { toPosixPath } from '../../shared/path-pattern.js';
import type { MemoryPort } from '../application/memory.port.js';
import type { MemoryEntry, MemoryNode, MemoryNodeKind, Recall } from '../domain/work-memory.js';

/** 프로젝트마다 다른 파일. 경로 표기(대소문자, \ 와 /) 차이는 같은 프로젝트로 본다. */
export function projectMemoryFile(memoryDir: string, projectRoot: string): string {
  const key = createHash('sha256').update(toPosixPath(projectRoot).toLowerCase()).digest('hex').slice(0, 12);
  return join(memoryDir, `${key}.db`);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, kind TEXT NOT NULL, text TEXT NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS edges (from_id TEXT NOT NULL, to_id TEXT NOT NULL, kind TEXT NOT NULL, PRIMARY KEY (from_id, to_id, kind));
CREATE INDEX IF NOT EXISTS edges_to ON edges (to_id);
CREATE VIRTUAL TABLE IF NOT EXISTS node_text USING fts5(id UNINDEXED, text);
`;

/** 작업이나 질문처럼 기억을 찾았을 때 돌려주는 머리 점 */
const HEADS: ReadonlySet<MemoryNodeKind> = new Set(['work', 'question']);

interface NodeRow {
  id: string;
  kind: MemoryNodeKind;
  text: string;
  at: string;
}

/** 검색어 → FTS5 질의. 단어마다 앞부분 일치("Money" → "Money에")로, 하나라도 맞으면 찾는다. */
function ftsQuery(text: string): string | null {
  const words = text.split(/\s+/).map((w) => w.trim()).filter((w) => w !== '');
  if (words.length === 0) return null;
  return words.map((w) => `"${w.replace(/"/g, '""')}"*`).join(' OR ');
}

/**
 * 로컬 SQLite 파일 하나에 둔 기억 그래프. 점과 선 표 두 개, 점 글은 전문 검색(FTS5)으로 찾는다.
 * 찾은 점이 결정·파일이면 선을 거꾸로 따라 작업으로 올라가고, 맞은 작업들은 최근 것부터 돌려준다.
 */
export class SqliteMemory implements MemoryPort {
  private constructor(private readonly db: Database.Database) {}

  static open(file: string): SqliteMemory {
    mkdirSync(dirname(file), { recursive: true });
    const db = new Database(file);
    db.pragma('journal_mode = WAL');
    db.exec(SCHEMA);
    return new SqliteMemory(db);
  }

  close(): void {
    this.db.close();
  }

  async save(entry: MemoryEntry): Promise<void> {
    const node = this.db.prepare('INSERT OR IGNORE INTO nodes (id, kind, text, at) VALUES (?, ?, ?, ?)');
    const text = this.db.prepare('INSERT INTO node_text (id, text) VALUES (?, ?)');
    const edge = this.db.prepare('INSERT OR IGNORE INTO edges (from_id, to_id, kind) VALUES (?, ?, ?)');
    this.db.transaction(() => {
      for (const n of entry.nodes) {
        if (node.run(n.id, n.kind, n.text, n.at).changes > 0) text.run(n.id, n.text);
      }
      for (const e of entry.edges) edge.run(e.from, e.to, e.kind);
    })();
  }

  async search(text: string, limit: number): Promise<Recall[]> {
    const query = ftsQuery(text);
    if (query === null) return [];
    const hits = this.db.prepare('SELECT id FROM node_text WHERE node_text MATCH ?').all(query) as { id: string }[];
    const heads = new Set<string>();
    for (const { id } of hits) for (const head of this.headsOf(id)) heads.add(head);
    return this.recallsOf([...heads], limit);
  }

  async recent(limit: number): Promise<Recall[]> {
    const rows = this.db.prepare("SELECT id FROM nodes WHERE kind IN ('work', 'question') ORDER BY at DESC LIMIT ?").all(limit) as { id: string }[];
    return this.recallsOf(rows.map((r) => r.id), limit);
  }

  /** 점에서 선을 거꾸로 따라가 그 점을 가진 작업·질문을 찾는다(답 → 질문처럼 두 단계까지). */
  private headsOf(id: string): string[] {
    const found = new Set<string>();
    let frontier = [id];
    for (let depth = 0; depth < 3 && frontier.length > 0; depth += 1) {
      const next: string[] = [];
      for (const current of frontier) {
        const row = this.node(current);
        if (row !== null && HEADS.has(row.kind)) {
          found.add(current);
          continue;
        }
        const parents = this.db.prepare("SELECT from_id FROM edges WHERE to_id = ? AND kind != 'extends'").all(current) as { from_id: string }[];
        next.push(...parents.map((p) => p.from_id));
      }
      frontier = next;
    }
    return [...found];
  }

  private recallsOf(ids: readonly string[], limit: number): Recall[] {
    return ids
      .map((id) => this.node(id))
      .filter((n): n is NodeRow => n !== null)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit)
      .map((work) => ({ work, neighbors: this.neighbors(work.id) }));
  }

  /** 한 단계 이웃. 질문이면 답과 답이 인용한 파일까지. 보충 선(extends)은 이웃으로 치지 않는다. */
  private neighbors(id: string): MemoryNode[] {
    const children = this.db
      .prepare("SELECT n.id, n.kind, n.text, n.at FROM edges e JOIN nodes n ON n.id = e.to_id WHERE e.from_id = ? AND e.kind != 'extends'")
      .all(id) as NodeRow[];
    const answers = children.filter((c) => c.kind === 'answer');
    const cited = answers.flatMap((a) => this.db.prepare('SELECT n.id, n.kind, n.text, n.at FROM edges e JOIN nodes n ON n.id = e.to_id WHERE e.from_id = ?').all(a.id) as NodeRow[]);
    return [...children, ...cited];
  }

  private node(id: string): NodeRow | null {
    return (this.db.prepare('SELECT id, kind, text, at FROM nodes WHERE id = ?').get(id) as NodeRow | undefined) ?? null;
  }
}
