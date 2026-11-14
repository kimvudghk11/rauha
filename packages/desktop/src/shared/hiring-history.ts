/**
 * 채용 검토실 N차 리뷰 기록: 보낼 때마다 한 회차. 회사 5곳의 판정·점수·중점을 남기고,
 * 회차별 정리 글과 Main 에 포트폴리오 문서를 부탁하는 글을 만든다. 기록은 main 이 평가 결과를 받을 때 붙인다(화면 값을 믿지 않음).
 */
export interface RoundResult {
  readonly id: string;
  readonly label: string;
  readonly role: string;
  readonly stamp: 'pass' | 'hold' | 'drop';
  readonly reached: string;
  readonly reachedLabel: string;
  readonly total: number;
  readonly passScore: number;
  readonly languagePolicy: string;
  readonly strengths: readonly string[];
  readonly gaps: readonly string[];
  readonly question: string;
  readonly comment: string;
}

export interface HiringRound {
  readonly n: number;
  /** ISO 시각 */
  readonly at: string;
  readonly years: number;
  readonly role: string;
  readonly results: readonly RoundResult[];
}

const ROUNDS_MAX = 20;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const txt = (v: unknown, max = 600): string => (typeof v === 'string' ? v.slice(0, max) : '');
const txts = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => txt(x, 300)).filter((x) => x !== '').slice(0, 8) : []);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function resultOf(v: unknown): RoundResult | null {
  if (!isObj(v)) return null;
  const stamp = v['stamp'] === 'pass' || v['stamp'] === 'hold' || v['stamp'] === 'drop' ? v['stamp'] : null;
  if (stamp === null || txt(v['id'], 4) === '') return null;
  return { id: txt(v['id'], 4), label: txt(v['label'], 80), role: txt(v['role'], 120), stamp, reached: txt(v['reached'], 20), reachedLabel: txt(v['reachedLabel'], 40), total: num(v['total']), passScore: num(v['passScore']), languagePolicy: txt(v['languagePolicy'], 60), strengths: txts(v['strengths']), gaps: txts(v['gaps']), question: txt(v['question'], 400), comment: txt(v['comment'], 1200) };
}

export class HiringHistory {
  private constructor(readonly rounds: readonly HiringRound[]) {}

  static empty(): HiringHistory {
    return new HiringHistory([]);
  }

  static from(saved: unknown): HiringHistory {
    const raw = isObj(saved) && Array.isArray(saved['rounds']) ? saved['rounds'] : [];
    const rounds = raw.filter(isObj).map((r): HiringRound => ({ n: num(r['n']), at: txt(r['at'], 40), years: num(r['years']), role: txt(r['role'], 20), results: (Array.isArray(r['results']) ? r['results'] : []).map(resultOf).filter((x): x is RoundResult => x !== null) }));
    return new HiringHistory(rounds.filter((r) => r.n > 0).slice(-ROUNDS_MAX));
  }

  toJson(): { readonly rounds: readonly HiringRound[] } {
    return { rounds: this.rounds };
  }

  latest(): HiringRound | null {
    return this.rounds[this.rounds.length - 1] ?? null;
  }

  /** 새 회차(번호는 앞 회차 다음) */
  start(meta: { readonly at: string; readonly years: number; readonly role: string }): HiringHistory {
    const n = (this.latest()?.n ?? 0) + 1;
    return new HiringHistory([...this.rounds, { n, ...meta, results: [] }].slice(-ROUNDS_MAX));
  }

  /** 그 회차에 회사 결과를 붙인다(같은 회사면 덮어씀) */
  record(n: number, result: RoundResult): HiringHistory {
    return new HiringHistory(this.rounds.map((r) => (r.n !== n ? r : { ...r, results: [...r.results.filter((x) => x.id !== result.id), result].sort((a, b) => a.id.localeCompare(b.id)) })));
  }
}

const STAMP = { pass: 'PASS', hold: 'HOLD', drop: 'DROP' } as const;

/** N차 리뷰 정리 글(목록) */
export function roundMarkdown(r: HiringRound): string {
  const count = (k: 'pass' | 'hold' | 'drop'): number => r.results.filter((x) => x.stamp === k).length;
  // 날짜는 이 컴퓨터 날짜로(UTC 로 자르면 한국 오전 시간이 하루 전으로 보인다)
  const day = Number.isNaN(Date.parse(r.at)) ? r.at.slice(0, 10) : new Date(r.at).toLocaleDateString('sv-SE');
  const lines = [`## ${r.n}차 review · ${day} · 연차 ${r.years}년 · ${r.role === 'any' ? '직무 섞음' : r.role}`, `- 결과: PASS ${count('pass')} · HOLD ${count('hold')} · DROP ${count('drop')}`];
  for (const x of r.results) {
    lines.push(`- **${x.label}** — ${x.role}`);
    lines.push(`  - ${STAMP[x.stamp]} · ${x.total}/100 (기준 ${x.passScore}) · ${x.reachedLabel}에서 멈춤 · ${x.languagePolicy}`);
    if (x.comment !== '') lines.push(`  - 한 줄: ${x.comment}`);
    if (x.strengths.length > 0) lines.push(`  - 잘한 점: ${x.strengths.join(' / ')}`);
    if (x.gaps.length > 0) lines.push(`  - 부족한 점: ${x.gaps.join(' / ')}`);
    if (x.question !== '') lines.push(`  - 다음 질문: ${x.question}`);
  }
  return lines.join('\n');
}

const PROMPT_MAX = 14_000;

/** Main 채팅에 넣을 글: N차 리뷰들을 분석해 포트폴리오 문서를 부탁한다 */
export function portfolioPrompt(rounds: readonly HiringRound[]): string {
  const body = rounds.map(roundMarkdown).join('\n\n');
  return [
    '아래는 rauha 채용 검토실에서 받은 N차 review 결과야(가상 회사 5곳이 내 git 작업을 각자 평가표로 본 것).',
    '이걸 분석해서 내 포트폴리오 문서를 써 줘.',
    '- 여러 회차·회사에서 반복해서 나온 잘한 점은 앞에 근거(레포·커밋)와 함께 세우고,',
    '- 반복해서 나온 부족한 점은 포트폴리오에서 어떻게 보완해 보여 줄지(수치·운영 경험·설계 설명) 제안해 줘.',
    '- 회사 유형(스타트업·대기업·빅테크 등)별로 강조할 점도 정리해 줘.',
    '',
    body.length > PROMPT_MAX ? `${body.slice(0, PROMPT_MAX)}\n(앞 회차 일부 생략)` : body,
  ].join('\n');
}

/** 희망 연봉(만 원)과 공고 연봉 범위: 안·아래·조금 위(10% 안)·많이 위 */
export function salaryFit(desired: number | null, band: { readonly min: number; readonly max: number }): 'in' | 'below' | 'stretch' | 'above' | null {
  if (desired === null) return null;
  if (desired < band.min) return 'below';
  if (desired <= band.max) return 'in';
  return desired <= band.max * 1.1 ? 'stretch' : 'above';
}
