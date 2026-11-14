import { describe, expect, it } from 'vitest';
import { INTERVIEWERS, InterviewDto, STAGES } from './interview.dto.js';

describe('면접관 패널', () => {
  it('면접관 5명은 실존 인물 이름 없이 관점 이름만', () => {
    expect(INTERVIEWERS).toHaveLength(5);
    for (const p of INTERVIEWERS) expect(p.name).not.toMatch(/buffett|jobs|버핏|잡스|토스/i);
  });
});

const good = {
  overall: { reached: 'technical', summary: '꾸준히 기능을 냈다', strengths: ['테스트 습관'], gaps: ['성과 수치 없음'], next: ['README 에 수치'] },
  panel: INTERVIEWERS.map((p) => ({ id: p.id, reached: 'assignment', comment: `${p.name} 의견`, strengths: ['a'], gaps: ['b'], question: '왜 그렇게 했나요?' })),
};

describe('평가 결과 읽기', () => {
  it('단계 이름은 정해진 다섯 중 하나, 면접관은 다섯 모두', () => {
    const r = InterviewDto.from(good);
    expect(r.overall.reached).toBe('technical');
    expect(r.panel.map((p) => p.id)).toEqual(INTERVIEWERS.map((p) => p.id));
    expect(STAGES.map((s) => s.id)).toContain(r.panel[0]!.reached);
  });
  it('모르는 단계는 서류(document)로, 빠진 면접관은 "평가 없음"으로 채운다', () => {
    const r = InterviewDto.from({ overall: { ...good.overall, reached: 'ceo' }, panel: good.panel.slice(0, 2) });
    expect(r.overall.reached).toBe('document');
    expect(r.panel).toHaveLength(5);
    expect(r.panel[4]!.comment).toMatch(/No evaluation/);
  });
  it('모양이 틀리면 실패', () => {
    expect(() => InterviewDto.from(null)).toThrow();
  });
});
