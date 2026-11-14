import { describe, expect, it } from 'vitest';
import { COMPANIES, CompanyVerdictDto, companyOf, STAGES } from './interview.dto.js';

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
const good = {
  reached: 'assignment',
  stamp: 'pass',
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
  it('단계·도장·담당자별 판단·근거·토론을 읽는다', () => {
    const v = CompanyVerdictDto.from(a, good);
    expect(v.id).toBe('A');
    expect(STAGES.map((s) => s.id)).toContain(v.reached);
    expect(v.stamp).toBe('pass');
    expect(v.notes.map((n) => n.who)).toEqual(a.recruiters.map((r) => r.name));
    expect(v.evidence).toEqual(['feat: 결제 재시도']);
  });
  it('토론은 이 회사 담당자의 말만 남긴다(지어낸 사람은 버림)', () => {
    expect(CompanyVerdictDto.from(a, good).talk.map((t) => t.who)).toEqual([a.recruiters[0]!.name, a.recruiters[1]!.name]);
  });
  it('담당자별 판단은 담당자 순서대로, 빠진 사람은 빈 판단', () => {
    const v = CompanyVerdictDto.from(a, { ...good, notes: [{ who: a.recruiters[2]!.name, note: '셋째' }] });
    expect(v.notes.map((n) => n.note)).toEqual(['', '', '셋째']);
  });
  it('모르는 단계는 서류로, 모르는 도장은 hold 로', () => {
    const v = CompanyVerdictDto.from(a, { ...good, reached: 'ceo', stamp: 'maybe' });
    expect(v.reached).toBe('document');
    expect(v.stamp).toBe('hold');
  });
  it('모양이 틀리면 실패', () => {
    expect(() => CompanyVerdictDto.from(a, null)).toThrow();
  });
});
