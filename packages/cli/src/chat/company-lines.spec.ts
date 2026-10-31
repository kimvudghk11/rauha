import { describe, expect, it } from 'vitest';
import { companyLines } from './company-lines.js';

describe('companyLines', () => {
  it('비었으면 아직 정한 것이 없다고 알리고 어떻게 쌓이는지 말한다', () => {
    const text = companyLines([]).join('\n');
    expect(text).toContain('아직');
    expect(text).toContain('부서');
  });

  it('부서 이름과 날짜 아래에 요약을 들여 써서 보여 준다', () => {
    const lines = companyLines([{ department: 'planning', summary: '■ 모델\n- 구독', at: '2026-11-01T10:00:00.000Z' }]);
    expect(lines.some((l) => l.includes('기획·전략부') && l.includes('2026-11-01'))).toBe(true);
    expect(lines).toContain('    - 구독');
  });

  it('부서 순서(기획 → 디자인 → 마케팅 → 품질 → 운영)대로 보여 준다', () => {
    const text = companyLines([
      { department: 'operations', summary: 'o', at: '2026-11-01T00:00:00.000Z' },
      { department: 'planning', summary: 'p', at: '2026-11-01T00:00:00.000Z' },
    ]).join('\n');
    expect(text.indexOf('기획·전략부')).toBeLessThan(text.indexOf('운영·유지보수부'));
  });
});
