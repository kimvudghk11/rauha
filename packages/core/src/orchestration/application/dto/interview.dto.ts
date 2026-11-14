import { DomainError } from '../../../shared/domain-error.js';
import type { JobPosting } from '../../domain/job-posting.js';

/**
 * 채용 검토실: A~E 회사 다섯 곳이 내 작업 요약(커밋 제목·숫자)을 읽고 채용 단계를 어디까지 갈지 본다.
 * 공고(업종·직무·스택·경쟁률)는 보낼 때마다 job-posting 이 새로 만들고, 방(A~E)마다 가상 담당자 3명이 있고, 담당자마다 유명 인물이 공개적으로 한 "사람 보는 법" 하나를 기준으로 맡는다(출처를 밝힌다).
 * 담당자는 그 인물인 척 말하지 않는다. 회사마다 따로 평가해서 먼저 끝난 회사부터 화면에 결과가 뜬다.
 */
export interface Principle {
  /** 기준을 말한 사람(출처) */
  readonly by: string;
  /** 그 사람이 공개적으로 말한 기준의 요약(한국어) */
  readonly rule: string;
}

export interface Recruiter {
  /** 가상 이름(회사 사이에서도 겹치지 않음) */
  readonly name: string;
  readonly title: string;
  readonly principle: Principle;
}

export interface Company {
  /** A~E */
  readonly id: string;
  readonly lens: string;
  /** 모델에 주는 분위기·말투 */
  readonly style: string;
  readonly recruiters: readonly Recruiter[];
}

const lead = '채용 리드';
const hands = '실무 면접관';
const people = '인사 담당';

export const COMPANIES: readonly Company[] = [
  {
    id: 'A',
    lens: 'Integrity, long-term value, knowing your limits',
    style: 'Calm, plain words, short anecdotes; asks what lasts ten years and whether the record is honest.',
    recruiters: [
      { name: '한결', title: lead, principle: { by: '워런 버핏', rule: '정직·지능·에너지를 본다. 정직이 없으면 나머지 둘이 오히려 위험하다.' } },
      { name: '도윤', title: hands, principle: { by: '찰리 멍거', rule: '자기 능력의 범위를 알고, 그 안에서 깊게 판다.' } },
      { name: '서진', title: people, principle: { by: '레이 달리오', rule: '실수를 숨기지 않고 드러내서 배운다.' } },
    ],
  },
  {
    id: 'B',
    lens: 'Product taste, craft, growth',
    style: 'Intense, blunt, obsessed with simplicity and the end user; dislikes feature lists without a point.',
    recruiters: [
      { name: '미르', title: lead, principle: { by: '스티브 잡스', rule: 'A급은 A급과 일하고 싶어 한다. 사용자가 안 볼 곳의 완성도까지 챙긴다.' } },
      { name: '하람', title: hands, principle: { by: '리드 헤이스팅스', rule: '키퍼 테스트: 이 사람이 떠난다고 하면 붙잡겠는가.' } },
      { name: '이안', title: people, principle: { by: '사티아 나델라', rule: '다 아는 사람보다 계속 배우는 사람.' } },
    ],
  },
  {
    id: 'C',
    lens: 'Technical depth, evidence in code, finishing',
    style: 'Fast, precise, keeps asking "why" and "how did you measure it"; cares about reliability, money flows and ownership.',
    recruiters: [
      { name: '토리', title: lead, principle: { by: '리누스 토르발스', rule: '말은 쉽다. 코드를 보여 달라.' } },
      { name: '준서', title: hands, principle: { by: '조엘 스폴스키', rule: '똑똑하고, 일을 끝낸다. 둘 다여야 한다.' } },
      { name: '다온', title: people, principle: { by: '켄트 벡', rule: '먼저 작동하게, 그다음 올바르게, 그다음 빠르게.' } },
    ],
  },
  {
    id: 'D',
    lens: 'Scale, reliability, raising the bar',
    style: 'Methodical; asks about trade-offs, failure modes, boundaries and how the system grows.',
    recruiters: [
      { name: '아치', title: lead, principle: { by: '라즐로 복(구글 인사)', rule: '일반 인지 능력, 자연스럽게 나서는 리더십, 겸손과 주인의식, 직무 지식.' } },
      { name: '세아', title: hands, principle: { by: '제프 베이조스', rule: '바 레이저: 이 사람을 뽑으면 팀 평균이 올라가는가.' } },
      { name: '류하', title: people, principle: { by: '베르너 보겔스', rule: '만든 사람이 운영까지 책임진다.' } },
    ],
  },
  {
    id: 'E',
    lens: 'Execution, speed, initiative',
    style: 'Energetic; cares about shipping, learning loops and doing hard things without being asked.',
    recruiters: [
      { name: '런치', title: lead, principle: { by: '폴 그레이엄', rule: '끈질기게 방법을 찾아내는 사람.' } },
      { name: '지호', title: hands, principle: { by: '일론 머스크', rule: '직접 푼 가장 어려운 문제를 어떻게 풀었는지 들으면 안다.' } },
      { name: '보리', title: people, principle: { by: '패티 맥코드', rule: '지금 회사에 필요한 일을 해낼 사람을 뽑는다.' } },
    ],
  },
];

export function companyOf(id: unknown): Company | null {
  return COMPANIES.find((c) => c.id === id) ?? null;
}

export const STAGES = [
  { id: 'document', label: '1차 서류' },
  { id: 'assignment', label: '2차 과제' },
  { id: 'technical', label: '3차 기술 면접' },
  { id: 'culture', label: '4차 컬처 면접' },
  { id: 'offer', label: '최종 합격' },
] as const;
export type StageId = (typeof STAGES)[number]['id'];

/** 회사가 찍는 도장: 통과·보류·탈락 */
export const STAMPS = ['pass', 'hold', 'drop'] as const;
export type Stamp = (typeof STAMPS)[number];

export interface CompanyVerdict {
  readonly id: string;
  /** 지원자가 멈추는 단계(offer 면 최종 합격) */
  readonly reached: StageId;
  /** 1차 서류 결과 */
  readonly stamp: Stamp;
  /** 이 회사 지원자 중 추정 순위(상위 %, 1 이 가장 좋음) — 참고용 */
  readonly percentile: number;
  /** 평가표 항목별 점수(0~100)와 근거 */
  readonly scores: readonly { readonly key: string; readonly label: string; readonly weight: number; readonly score: number; readonly evidence: string }[];
  /** 배점을 반영한 합계(100점 만점) */
  readonly total: number;
  /** 공고 주 언어 경험의 근거가 있는지 */
  readonly languageMet: boolean;
  /** 공고가 원하는 것 중 근거가 있는 것 / 없는 것 */
  readonly stackHave: readonly string[];
  readonly stackMissing: readonly string[];
  readonly comment: string;
  readonly strengths: readonly string[];
  readonly gaps: readonly string[];
  readonly question: string;
  /** 담당자마다 자기 기준으로 본 한 줄(담당자 순서대로) */
  readonly notes: readonly { readonly who: string; readonly note: string }[];
  /** 판단의 근거가 된 커밋·저장소·숫자 */
  readonly evidence: readonly string[];
  /** 세 담당자가 검토하며 나눈 대화(이 회사 담당자 말만) */
  readonly talk: readonly { readonly who: string; readonly text: string }[];
}

const stageIds = STAGES.map((s) => s.id) as readonly string[];
const strArr = { type: 'array', items: { type: 'string' } } as const;
const whoText = (key: string) => ({ type: 'array', items: { type: 'object', properties: { who: { type: 'string' }, [key]: { type: 'string' } }, required: ['who', key] } }) as const;

export const COMPANY_SCHEMA = {
  type: 'object',
  properties: {
    scores: {
      type: 'array',
      description: 'One entry per rubric criterion key: score 0-100 and one Korean sentence of evidence',
      items: { type: 'object', properties: { key: { type: 'string' }, score: { type: 'number' }, evidence: { type: 'string' } }, required: ['key', 'score', 'evidence'] },
    },
    languageMet: { type: 'boolean', description: 'Whether the summary shows real work in the posting’s main language' },
    percentile: { type: 'number', description: 'Where the candidate ranks among this company’s real applicants for this role: top N percent (1 = best, 100 = worst)' },
    stackHave: { ...strArr, description: 'Items of the job posting the summary gives real evidence for' },
    stackMissing: { ...strArr, description: 'Items of the job posting with no evidence in the summary' },
    reached: { type: 'string', enum: stageIds, description: 'The stage where the candidate would stop (offer = gets the offer)' },
    comment: { type: 'string', description: 'The company’s decision in two to four Korean sentences' },
    strengths: strArr,
    gaps: strArr,
    question: { type: 'string', description: 'One real question this company would ask next (Korean)' },
    notes: { ...whoText('note'), description: 'One Korean sentence per recruiter, judging the candidate by that recruiter’s principle' },
    evidence: { ...strArr, description: 'Commit subjects, repos or numbers from the summary this rests on (quote them)' },
    talk: { ...whoText('text'), description: '6 to 10 short Korean lines: the three recruiters discussing the candidate like real colleagues, leading to the decision' },
  },
  required: ['scores', 'languageMet', 'percentile', 'stackHave', 'stackMissing', 'reached', 'comment', 'strengths', 'gaps', 'question', 'notes', 'evidence', 'talk'],
} as const;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 1200): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strs = (v: unknown, n = 6): string[] => (Array.isArray(v) ? v.map((x) => str(x, 300)).filter((x) => x !== '').slice(0, n) : []);
const stage = (v: unknown): StageId => (stageIds.includes(v as string) ? (v as StageId) : 'document');
const TALK_MAX = 12;
/** 공고 연차보다 이만큼 모자라면 서류 PASS 를 주지 않는다 */
export const YEARS_GAP_MAX = 3;
/** 기준 점수에서 이만큼 안쪽이면 HOLD */
export const HOLD_BAND = 8;

export class CompanyVerdictDto {
  private constructor() {}

  /** 모델이 낸 한 회사의 평가. 담당자 이름은 이 회사 사람만 받는다(지어낸 이름은 버림) */
  static from(company: Company, posting: JobPosting, output: unknown, years: number): CompanyVerdict {
    if (!isObj(output)) throw new DomainError('INTERVIEW_FAILED', `Could not read ${posting.label}'s evaluation.`);
    const names = company.recruiters.map((r) => r.name);
    const rows = (v: unknown, key: string): { who: string; text: string }[] =>
      (Array.isArray(v) ? v.filter(isObj) : []).map((x) => ({ who: str(x['who'], 40), text: str(x[key], 500) })).filter((x) => names.includes(x.who) && x.text !== '');
    const notes = rows(output['notes'], 'note');
    const rawScores = Array.isArray(output['scores']) ? output['scores'].filter(isObj) : [];
    const scores = posting.rubric.criteria.map((c) => {
      const hit = rawScores.find((x) => x['key'] === c.key);
      const n = typeof hit?.['score'] === 'number' && Number.isFinite(hit['score']) ? Math.max(0, Math.min(100, Math.round(hit['score']))) : 0;
      return { key: c.key, label: c.label, weight: c.weight, score: n, evidence: str(hit?.['evidence'], 300) };
    });
    const total = Math.round(scores.reduce((n, x) => n + (x.weight * x.score) / 100, 0));
    const languageMet = output['languageMet'] === true;
    const { reached, stamp } = CompanyVerdictDto.calibrate(posting, years, total, languageMet, stage(output['reached']));
    const pct = output['percentile'];
    return {
      id: company.id,
      reached,
      stamp,
      percentile: typeof pct === 'number' && Number.isFinite(pct) && pct >= 1 && pct <= 100 ? Math.round(pct) : 100,
      scores,
      total,
      languageMet,
      stackHave: strs(output['stackHave'], 10),
      stackMissing: strs(output['stackMissing'], 10),
      comment: str(output['comment']),
      strengths: strs(output['strengths']),
      gaps: strs(output['gaps']),
      question: str(output['question'], 400),
      notes: names.map((who) => ({ who, note: notes.find((n) => n.who === who)?.text ?? '' })),
      evidence: strs(output['evidence'], 8),
      talk: rows(output['talk'], 'text').slice(0, TALK_MAX),
    };
  }

  /**
   * 판정은 회사 평가표로(모델의 도장은 쓰지 않는다): 배점 합계가 기준 점수 이상이면 PASS, 기준보다 HOLD_BAND(8)점 안이면 HOLD, 그 밖은 DROP.
   * 주 언어 경험이 "필수"인 공고에서 근거가 없으면 DROP. 공고 연차보다 3년 이상 모자라면 PASS 불가(HOLD).
   * PASS 면 적어도 2차까지 가고, 아니면 서류에서 멈춘다.
   */
  private static calibrate(posting: JobPosting, years: number, total: number, languageMet: boolean, reached0: StageId): { reached: StageId; stamp: Stamp } {
    const pass = posting.rubric.passScore;
    let stamp: Stamp = total >= pass ? 'pass' : total >= pass - HOLD_BAND ? 'hold' : 'drop';
    if (posting.rubric.languagePolicy === 'required' && !languageMet) stamp = 'drop';
    if (posting.minYears - years >= YEARS_GAP_MAX && stamp === 'pass') stamp = 'hold';
    const reached: StageId = stamp !== 'pass' ? 'document' : reached0 === 'document' ? 'assignment' : reached0;
    return { reached, stamp };
  }
}
