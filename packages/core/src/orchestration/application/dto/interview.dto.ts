import { DomainError } from '../../../shared/domain-error.js';

/**
 * 면접관 패널: 내 작업 요약(커밋 제목·숫자)을 읽고 채용 단계를 어디까지 갈지 본다.
 * 면접관은 실존 인물이 아니라 관점·말투만 본뜬 가상 인물이다(실존 인물을 사칭하지 않는다).
 */
export interface Interviewer {
  readonly id: string;
  readonly name: string;
  readonly lens: string;
  /** 모델에 주는 말투·관점 설명 */
  readonly style: string;
}

export const INTERVIEWERS: readonly Interviewer[] = [
  { id: 'value', name: '한결 (가치 투자자형)', lens: 'Long-term value, business sense', style: 'Calm, folksy, asks what lasts in 10 years and whether the work compounds. Plain words, short anecdotes.' },
  { id: 'product', name: '미르 (제품 집착형)', lens: 'Product taste, focus, simplicity', style: 'Intense, blunt, obsessed with simplicity and the end user; dislikes feature lists without a point.' },
  { id: 'fintech', name: '토리 (핀테크 기술 면접관형)', lens: 'Technical depth, data, ownership', style: 'Fast, precise, keeps asking "why" and "how did you measure it"; cares about reliability, money flows and ownership.' },
  { id: 'architect', name: '아치 (아키텍트형)', lens: 'Scale, reliability, design', style: 'Methodical; asks about trade-offs, failure modes, boundaries and how the system grows.' },
  { id: 'founder', name: '런치 (창업가형)', lens: 'Execution, speed, initiative', style: 'Energetic; cares about shipping, learning loops and doing hard things without being asked.' },
];

export const STAGES = [
  { id: 'document', label: '1차 서류' },
  { id: 'assignment', label: '2차 과제' },
  { id: 'technical', label: '3차 기술 면접' },
  { id: 'culture', label: '4차 컬처 면접' },
  { id: 'offer', label: '최종 합격' },
] as const;
export type StageId = (typeof STAGES)[number]['id'];

export interface PanelVerdict {
  readonly id: string;
  readonly reached: StageId;
  readonly comment: string;
  readonly strengths: readonly string[];
  readonly gaps: readonly string[];
  readonly question: string;
}

export interface InterviewResult {
  readonly overall: { readonly reached: StageId; readonly summary: string; readonly strengths: readonly string[]; readonly gaps: readonly string[]; readonly next: readonly string[] };
  readonly panel: readonly PanelVerdict[];
}

const stageIds = STAGES.map((s) => s.id) as readonly string[];
const verdictSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', enum: INTERVIEWERS.map((p) => p.id) },
    reached: { type: 'string', enum: stageIds },
    comment: { type: 'string', description: 'Two to four sentences in Korean, in this interviewer’s voice' },
    strengths: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
    question: { type: 'string', description: 'One real question this interviewer would ask next (Korean)' },
  },
  required: ['id', 'reached', 'comment', 'strengths', 'gaps', 'question'],
} as const;

export const INTERVIEW_SCHEMA = {
  type: 'object',
  properties: {
    overall: {
      type: 'object',
      properties: { reached: { type: 'string', enum: stageIds }, summary: { type: 'string' }, strengths: { type: 'array', items: { type: 'string' } }, gaps: { type: 'array', items: { type: 'string' } }, next: { type: 'array', items: { type: 'string' } } },
      required: ['reached', 'summary', 'strengths', 'gaps', 'next'],
    },
    panel: { type: 'array', items: verdictSchema },
  },
  required: ['overall', 'panel'],
} as const;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 1200): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => str(x, 300)).filter((x) => x !== '').slice(0, 6) : []);
const stage = (v: unknown): StageId => (stageIds.includes(v as string) ? (v as StageId) : 'document');

export class InterviewDto {
  private constructor() {}

  static from(output: unknown): InterviewResult {
    if (!isObj(output) || !isObj(output['overall'])) throw new DomainError('INTERVIEW_FAILED', 'Could not read the panel’s evaluation.');
    const o = output['overall'];
    const raw = Array.isArray(output['panel']) ? output['panel'].filter(isObj) : [];
    const panel = INTERVIEWERS.map((p): PanelVerdict => {
      const v = raw.find((x) => x['id'] === p.id);
      if (v === undefined) return { id: p.id, reached: 'document', comment: 'No evaluation from this interviewer.', strengths: [], gaps: [], question: '' };
      return { id: p.id, reached: stage(v['reached']), comment: str(v['comment']), strengths: strs(v['strengths']), gaps: strs(v['gaps']), question: str(v['question'], 400) };
    });
    return { overall: { reached: stage(o['reached']), summary: str(o['summary']), strengths: strs(o['strengths']), gaps: strs(o['gaps']), next: strs(o['next']) }, panel };
  }
}
