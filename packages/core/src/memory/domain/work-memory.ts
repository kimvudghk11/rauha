export type MemoryNodeKind = 'work' | 'file' | 'test' | 'decision' | 'assumption' | 'question' | 'answer';
export type MemoryEdgeKind = 'changed' | 'tested-by' | 'decided' | 'assumed' | 'extends' | 'answered' | 'cites';

export interface MemoryNode {
  readonly id: string;
  readonly kind: MemoryNodeKind;
  readonly text: string;
  /** ISO 시각 */
  readonly at: string;
}

export interface MemoryEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: MemoryEdgeKind;
}

/** 한 번 저장할 점과 선 */
export interface MemoryEntry {
  readonly nodes: readonly MemoryNode[];
  readonly edges: readonly MemoryEdge[];
}

/** 기억에서 찾은 작업 하나와 한 단계 이웃 */
export interface Recall {
  readonly work: MemoryNode;
  readonly neighbors: readonly MemoryNode[];
}

/** 작업 요청이 "아까 그거"로 이어서 고칠 수 있는 기억은 작업뿐이다. 질문과 답은 고칠 대상이 아니다. */
export function continuable(recalls: readonly Recall[], limit: number): Recall[] {
  return recalls.filter((r) => r.work.kind === 'work').slice(0, limit);
}

/**
 * 기억 그래프를 만드는 규칙. 모델이 짐작한 연결은 넣지 않고, 실행에서 실제로 일어난 일
 * (바뀐 파일, 잠근 테스트, 근거가 확인된 결정, 확정된 해석, 사용자가 고른 원래 작업)로만 점과 선을 만든다.
 * 파일·테스트 점은 경로가 id라 여러 작업이 같은 점을 공유한다.
 */
export class WorkMemory {
  private constructor() {}

  static fromWork(p: {
    id: string;
    at: string;
    title: string;
    request: string;
    status: 'complete' | 'stopped';
    changedFiles: readonly string[];
    lockedTests: readonly string[];
    decisions: readonly { text: string; verified: boolean; rejected: string | null }[];
    assumptions: readonly { question: string; chosen: string }[];
    extendsWork: string | null;
  }): MemoryEntry {
    const workId = `work:${p.id}:0`;
    const nodes: MemoryNode[] = [
      { id: workId, kind: 'work', text: `${p.title}${p.status === 'stopped' ? ' (멈춤)' : ''}\n요청: ${p.request}`, at: p.at },
    ];
    const edges: MemoryEdge[] = [];
    const link = (node: MemoryNode, kind: MemoryEdgeKind) => {
      nodes.push(node);
      edges.push({ from: workId, to: node.id, kind });
    };
    for (const path of p.changedFiles) link({ id: `file:${path}`, kind: 'file', text: path, at: p.at }, 'changed');
    for (const path of p.lockedTests) link({ id: `test:${path}`, kind: 'test', text: path, at: p.at }, 'tested-by');
    p.decisions.forEach((d, i) => {
      const text = d.verified ? `${d.text}${d.rejected !== null ? ` (버린 안: ${d.rejected})` : ''}` : `[추측] ${d.text}`;
      link({ id: `decision:${p.id}:${i}`, kind: 'decision', text, at: p.at }, 'decided');
    });
    p.assumptions.forEach((a, i) => link({ id: `assumption:${p.id}:${i}`, kind: 'assumption', text: `${a.question} → ${a.chosen}`, at: p.at }, 'assumed'));
    if (p.extendsWork !== null) edges.push({ from: workId, to: p.extendsWork, kind: 'extends' });
    return { nodes, edges };
  }

  static fromAnswer(p: { id: string; at: string; question: string; answer: string; citedFiles: readonly string[] }): MemoryEntry {
    const questionId = `question:${p.id}:0`;
    const answerId = `answer:${p.id}:0`;
    return {
      nodes: [
        { id: questionId, kind: 'question', text: p.question, at: p.at },
        { id: answerId, kind: 'answer', text: p.answer, at: p.at },
        ...p.citedFiles.map((path): MemoryNode => ({ id: `file:${path}`, kind: 'file', text: path, at: p.at })),
      ],
      edges: [
        { from: questionId, to: answerId, kind: 'answered' },
        ...p.citedFiles.map((path): MemoryEdge => ({ from: answerId, to: `file:${path}`, kind: 'cites' })),
      ],
    };
  }
}

const LABEL: Partial<Record<MemoryNodeKind, string>> = { decision: '결정', assumption: '정한 해석', test: '잠근 테스트' };

function describe(recall: Recall): string {
  const title = recall.work.text.split('\n')[0];
  const files = recall.neighbors.filter((n) => n.kind === 'file').map((n) => n.text);
  const lines = [`- ${recall.work.at.slice(0, 10)} ${recall.work.kind === 'work' ? '작업' : '질문'}: ${title} [${recall.work.id}]`];
  if (files.length > 0) lines.push(`  바꾼 파일: ${files.join(', ')}`);
  for (const n of recall.neighbors) {
    const label = LABEL[n.kind];
    if (label !== undefined) lines.push(`  ${label}: ${n.text}`);
  }
  return lines.join('\n');
}

/** 팀장·답변 팀원에게 넘길 기억 묶음. 최근 작업부터, 글자 수 상한을 넘기 전까지만. */
export function recallBlock(recalls: readonly Recall[], maxChars: number): string {
  const sorted = [...recalls].sort((a, b) => b.work.at.localeCompare(a.work.at));
  const parts: string[] = [];
  let used = 0;
  for (const recall of sorted) {
    const text = describe(recall);
    const cost = text.length + (parts.length > 0 ? 1 : 0);
    if (used + cost > maxChars) break;
    parts.push(text);
    used += cost;
  }
  return parts.join('\n');
}
