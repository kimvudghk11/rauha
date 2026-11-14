import { describe, expect, it } from 'vitest';
import { draftPostings, INDUSTRY_ROLES, JOB_ROLES, seniorityOf, type Market } from './job-posting.js';

const ids = ['A', 'B', 'C', 'D', 'E'];

describe('연차 단계', () => {
  it('0년 신입, 1~3 주니어, 4~7 미들, 8년 이상 시니어', () => {
    expect([0, 1, 3, 4, 7, 8, 15].map(seniorityOf)).toEqual(['신입', '주니어', '주니어', '미들', '미들', '시니어', '시니어']);
  });
});

describe('채용 공고 만들기(보낼 때마다 다른 회사 조건)', () => {
  it('A~E 다섯 곳, 업종은 모두 다르고, 스타트업 하나와 대기업·빅테크 하나는 꼭 있다', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const p = draftPostings({ years: 3, role: 'any', seed });
      expect(p.map((x) => x.id)).toEqual(ids);
      expect(new Set(p.map((x) => x.industry)).size).toBe(5);
      expect(p.some((x) => x.tier === 'startup')).toBe(true);
      expect(p.some((x) => x.tier === 'big' || x.tier === 'bigtech')).toBe(true);
    }
  });
  it('같은 seed 면 같은 공고, 다른 seed 면 다른 공고', () => {
    expect(draftPostings({ years: 3, role: 'any', seed: 7 })).toEqual(draftPostings({ years: 3, role: 'any', seed: 7 }));
    expect(draftPostings({ years: 3, role: 'any', seed: 7 })).not.toEqual(draftPostings({ years: 3, role: 'any', seed: 8 }));
  });
  it('직무를 고르면 다섯 곳 모두 그 직무, 고르지 않으면 섞인다', () => {
    expect(draftPostings({ years: 5, role: 'frontend', seed: 3 }).every((p) => p.role.startsWith(JOB_ROLES.frontend))).toBe(true);
    const roles = new Set(Array.from({ length: 10 }, (_, s) => draftPostings({ years: 5, role: 'any', seed: s + 1 }).map((p) => p.role)).flat());
    expect(roles.size).toBeGreaterThan(3);
  });
  it('연차 요건은 내 연차 둘레(크게 벗어나지 않음), 신입이면 신입 가능 공고가 있다', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const p of draftPostings({ years: 4, role: 'any', seed })) expect(Math.abs(p.minYears - 4)).toBeLessThanOrEqual(4);
      expect(draftPostings({ years: 0, role: 'any', seed }).some((p) => p.minYears === 0)).toBe(true);
    }
  });
  it('경쟁률·서류 통과율은 회사 등급에 맞는 범위: 스타트업이 빅테크보다 경쟁률 낮고 통과율 높다', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const ps = draftPostings({ years: 3, role: 'any', seed });
      for (const p of ps) {
        expect(p.applicants).toBeGreaterThan(1);
        expect(p.passRates.document).toBeGreaterThan(0);
        expect(p.passRates.document).toBeLessThanOrEqual(45);
        expect(p.wants.length).toBeGreaterThanOrEqual(4);
      }
      const s = ps.find((p) => p.tier === 'startup')!;
      const big = ps.find((p) => p.tier === 'bigtech' || p.tier === 'big')!;
      expect(s.applicants).toBeLessThan(big.applicants);
      expect(s.passRates.document).toBeGreaterThan(big.passRates.document);
    }
  });
  it('신입·주니어 공고는 같은 등급이라도 지원자가 더 몰린다', () => {
    const avg = (years: number) => {
      const all = Array.from({ length: 30 }, (_, s) => draftPostings({ years, role: 'backend', seed: s + 1 })).flat();
      return all.reduce((n, p) => n + p.applicants, 0) / all.length;
    };
    expect(avg(0)).toBeGreaterThan(avg(10));
  });
});

describe('실제 공고에서 모은 시장 정보로 만들기', () => {
  const market: Market = {
    checkedAt: '2026-11-15',
    profiles: INDUSTRY_ROLES.flatMap((i) => i.roles.map((role) => ({ industry: i.name, role, stacks: [['실제스택', role]], extras: ['실제 요구'], companies: ['예시회사'], sources: [{ title: '공고', url: 'https://example.com/job' }] }))),
  };
  it('시장 정보가 있으면 그 스택·요구 경험을 쓰고, 공고에 근거(회사·출처·날짜)를 붙인다', () => {
    for (const p of draftPostings({ years: 3, role: 'any', seed: 5 }, market)) {
      expect(p.wants).toContain('실제스택');
      expect(p.wants).toContain('실제 요구');
      expect(p.basis).toEqual({ companies: ['예시회사'], sources: [{ title: '공고', url: 'https://example.com/job' }], checkedAt: '2026-11-15' });
    }
  });
  it('시장 정보가 없으면 내장 틀(근거 없음)', () => {
    expect(draftPostings({ years: 3, role: 'any', seed: 5 }).every((p) => p.basis === null)).toBe(true);
  });
});
