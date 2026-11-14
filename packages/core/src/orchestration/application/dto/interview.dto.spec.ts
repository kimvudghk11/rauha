import { describe, expect, it } from 'vitest';
import { draftPostings, type JobPosting } from '../../domain/job-posting.js';
import { COMPANIES, CompanyVerdictDto, companyOf, HOLD_BAND, STAGES, YEARS_GAP_MAX } from './interview.dto.js';

describe('채용 회사 A~E, 회사마다 담당자 3명', () => {
  it('회사는 A~E 다섯, 담당자는 회사마다 셋', () => {
    expect(COMPANIES.map((c) => c.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
    for (const c of COMPANIES) expect(c.recruiters).toHaveLength(3);
  });
  it('담당자는 가상 인물(실존 인물 이름 없음), 기준만 유명 인물에게서 빌리고 출처를 밝힌다', () => {
    for (const c of COMPANIES)
      for (const r of c.recruiters) {
        expect(r.name).not.toMatch(/buffett|jobs|버핏|잡스|토스|베이조스|머스크|그레이엄/i);
        expect(r.principle.by.trim()).not.toBe('');
        expect(r.principle.rule.trim()).not.toBe('');
      }
  });
  it('담당자 이름은 모두 달라 말풍선에서 헷갈리지 않는다', () => {
    const names = COMPANIES.flatMap((c) => c.recruiters.map((r) => r.name));
    expect(new Set(names).size).toBe(names.length);
  });
  it('모르는 회사 id 는 null', () => {
    expect(companyOf('A')?.id).toBe('A');
    expect(companyOf('Z')).toBeNull();
  });
});

const a = COMPANIES[0]!;
const base = draftPostings({ years: 3, role: 'backend', seed: 1 })[0]!;
const posting: JobPosting = { ...base, minYears: 3, passRates: { ...base.passRates, document: 20 } };
const read = (out: unknown, years = 3) => CompanyVerdictDto.from(a, posting, out, years);
/** 모든 항목을 같은 점수로 → 합계가 그 점수 */
const scored = (n: number, over: Record<string, unknown> = {}) => ({ ...good, scores: posting.rubric.criteria.map((c) => ({ key: c.key, score: n, evidence: `${c.label} 근거` })), ...over });
const good = {
  reached: 'assignment',
  percentile: 5,
  languageMet: true,
  scores: [] as { key: string; score: number; evidence: string }[],
  stackHave: ['TypeScript'],
  stackMissing: ['Java', 'Spring Boot'],
  comment: '꾸준히 냈다',
  strengths: ['테스트 습관'],
  gaps: ['성과 수치 없음'],
  question: '왜 그렇게 했나요?',
  notes: a.recruiters.map((r) => ({ who: r.name, note: `${r.name} 판단` })),
  evidence: ['feat: 결제 재시도'],
  talk: [
    { who: a.recruiters[0]!.name, text: '이 커밋 보셨어요?' },
    { who: '모르는 사람', text: '끼어들기' },
    { who: a.recruiters[1]!.name, text: '네, 테스트가 같이 바뀌었네요.' },
  ],
};

describe('회사 한 곳의 평가 결과 읽기', () => {
  it('단계·담당자별 판단·근거·토론을 읽는다', () => {
    const v = read(scored(posting.rubric.passScore));
    expect(v.id).toBe('A');
    expect(STAGES.map((s) => s.id)).toContain(v.reached);
    expect(v.notes.map((n) => n.who)).toEqual(a.recruiters.map((r) => r.name));
    expect(v.evidence).toEqual(['feat: 결제 재시도']);
  });
  it('토론은 이 회사 담당자의 말만 남긴다(지어낸 사람은 버림)', () => {
    expect(read(good).talk.map((t) => t.who)).toEqual([a.recruiters[0]!.name, a.recruiters[1]!.name]);
  });
  it('담당자별 판단은 담당자 순서대로, 빠진 사람은 빈 판단', () => {
    const v = read({ ...good, notes: [{ who: a.recruiters[2]!.name, note: '셋째' }] });
    expect(v.notes.map((n) => n.note)).toEqual(['', '', '셋째']);
  });
  it('평가표 항목별 점수(0~100으로 자름)와 배점을 반영한 합계, 빠진 항목은 0점', () => {
    const v = read({ ...good, scores: [{ key: posting.rubric.criteria[0]!.key, score: 150, evidence: 'x' }] });
    expect(v.scores.map((s) => s.key)).toEqual(posting.rubric.criteria.map((c) => c.key));
    expect(v.scores[0]!.score).toBe(100);
    expect(v.total).toBe(posting.rubric.criteria[0]!.weight);
    expect(read(scored(70)).total).toBe(70);
  });
  it('판정은 평가표 점수로: 기준 이상 PASS(적어도 2차까지), 기준 8점 안 HOLD, 그 밖 DROP(서류에서 멈춤)', () => {
    const p = posting.rubric.passScore;
    const pass = read(scored(p, { reached: 'document' }));
    expect(pass.stamp).toBe('pass');
    expect(pass.reached).toBe('assignment');
    expect(read(scored(p - HOLD_BAND)).stamp).toBe('hold');
    const drop = read(scored(p - HOLD_BAND - 1, { reached: 'technical' }));
    expect(drop.stamp).toBe('drop');
    expect(drop.reached).toBe('document');
  });
  it('주 언어가 "필수"인 공고에서 근거가 없으면 점수가 높아도 DROP, "무관"이면 점수대로', () => {
    const req = { ...posting, rubric: { ...posting.rubric, languagePolicy: 'required' as const } };
    const any = { ...posting, rubric: { ...posting.rubric, languagePolicy: 'any' as const } };
    expect(CompanyVerdictDto.from(a, req, scored(95, { languageMet: false }), 3).stamp).toBe('drop');
    expect(CompanyVerdictDto.from(a, any, scored(95, { languageMet: false }), 3).stamp).toBe('pass');
  });
  it('추정 순위(상위 %)는 참고로만 읽는다(1~100 밖은 100)', () => {
    expect(read({ ...good, percentile: 400 }).percentile).toBe(100);
    expect(read(scored(95, { percentile: 90 })).stamp).toBe('pass');
  });
  it('공고 연차보다 3년 이상 모자라면 PASS 를 주지 않는다(HOLD, 서류에서 멈춤)', () => {
    const v = read(scored(95), posting.minYears - YEARS_GAP_MAX);
    expect(v.stamp).toBe('hold');
    expect(v.reached).toBe('document');
    expect(read(scored(95), posting.minYears - YEARS_GAP_MAX + 1).stamp).toBe('pass');
  });
  it('모양이 틀리면 실패', () => {
    expect(() => read(null)).toThrow();
  });
});
