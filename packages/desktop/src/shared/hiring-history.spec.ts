import { describe, expect, it } from 'vitest';
import { HiringHistory, portfolioPrompt, roundMarkdown, salaryFit, type HiringRound } from './hiring-history.js';

const result = (id: string, stamp: 'pass' | 'hold' | 'drop', total: number) => ({
  id,
  label: `${id}사 · 핀테크`,
  role: '백엔드 개발자 · 경력 3년 이상',
  stamp,
  reached: stamp === 'pass' ? 'technical' : 'document',
  reachedLabel: stamp === 'pass' ? '3차 기술 면접' : '1차 서류',
  total,
  passScore: 72,
  languagePolicy: '주 언어 경험 우대',
  strengths: ['테스트 습관'],
  gaps: ['성과 수치 없음'],
  question: '장애를 어떻게 다뤘나요?',
  comment: '설계는 좋지만 수치가 없다.',
});
const round = (n: number): HiringRound => ({ n, at: '2026-11-15T03:40:00.000Z', years: 4, role: 'any', results: [result('A', 'pass', 78), result('B', 'drop', 51), result('C', 'hold', 66)] });

describe('N차 리뷰 기록', () => {
  it('회차 번호는 이어서 붙고, 같은 회차에 회사 결과를 붙인다(같은 회사는 덮어씀), 최근 20회차까지', () => {
    let h = HiringHistory.empty();
    h = h.start({ at: 't1', years: 4, role: 'any' });
    expect(h.latest()?.n).toBe(1);
    h = h.record(1, result('A', 'pass', 80)).record(1, result('A', 'hold', 70));
    expect(h.latest()?.results).toHaveLength(1);
    expect(h.latest()?.results[0]!.stamp).toBe('hold');
    for (let i = 0; i < 25; i++) h = h.start({ at: 't', years: 4, role: 'any' });
    expect(h.rounds).toHaveLength(20);
    expect(h.latest()?.n).toBe(26);
  });
  it('저장 파일에서 다시 읽고, 깨진 것은 빈 기록', () => {
    const h = HiringHistory.empty().start({ at: 't1', years: 2, role: 'backend' }).record(1, result('A', 'pass', 80));
    expect(HiringHistory.from(JSON.parse(JSON.stringify(h.toJson()))).rounds).toEqual(h.rounds);
    expect(HiringHistory.from({ rounds: 'x' }).rounds).toEqual([]);
  });
});

describe('리포트 글', () => {
  it('N차 리뷰: 회사마다 판정·점수(기준)·멈춘 단계·중점을 목록으로', () => {
    const md = roundMarkdown(round(3));
    expect(md).toMatch(/^## 3차 review/m);
    expect(md).toContain('A사 · 핀테크');
    expect(md).toMatch(/PASS · 78\/100 \(기준 72\)/);
    expect(md).toContain('3차 기술 면접');
    expect(md).toContain('성과 수치 없음');
    expect(md).toMatch(/PASS 1 · HOLD 1 · DROP 1/);
  });
  it('Main 에 넘길 글: 여러 회차를 모아 포트폴리오 문서를 요청하고, 반복해서 나온 부족한 점을 짚게 한다', () => {
    const p = portfolioPrompt([round(1), round(2)]);
    expect(p).toMatch(/포트폴리오/);
    expect(p).toContain('1차 review');
    expect(p).toContain('2차 review');
    expect(p).toMatch(/반복/);
  });
});

describe('희망 연봉과 공고 연봉 범위', () => {
  it('범위 안·아래·위(10% 넘게 높으면 협상 어려움)', () => {
    expect(salaryFit(5000, { min: 4500, max: 5500 })).toBe('in');
    expect(salaryFit(4000, { min: 4500, max: 5500 })).toBe('below');
    expect(salaryFit(5900, { min: 4500, max: 5500 })).toBe('stretch');
    expect(salaryFit(7000, { min: 4500, max: 5500 })).toBe('above');
    expect(salaryFit(null, { min: 4500, max: 5500 })).toBeNull();
  });
});
