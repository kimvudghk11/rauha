import { describe, expect, it } from 'vitest';
import { CompanyBook } from './company-book.js';

const entry = (department: 'planning' | 'marketing' | 'design' | 'quality' | 'operations', summary: string, at = '2026-11-01T10:00:00.000Z') => ({ department, summary, at });

describe('CompanyBook', () => {
  it('부서마다 가장 최근 결과 하나만 남긴다', () => {
    const book = CompanyBook.empty().with(entry('planning', '구독 모델')).with(entry('planning', '광고 모델', '2026-11-02T10:00:00.000Z'));
    expect(book.entries).toEqual([entry('planning', '광고 모델', '2026-11-02T10:00:00.000Z')]);
  });

  it('비어 있으면 팀원에게 줄 글이 없다', () => {
    expect(CompanyBook.empty().block()).toBeNull();
  });

  it('팀원에게 줄 글에 부서 이름과 날짜와 요약을 담고, 이미 정한 것과 어긋나지 않게 하라고 적는다', () => {
    const text = CompanyBook.empty().with(entry('planning', '구독 모델로 간다')).block()!;
    expect(text).toContain('<company>');
    expect(text).toContain('기획·전략부');
    expect(text).toContain('2026-11-01');
    expect(text).toContain('구독 모델로 간다');
    expect(text).toMatch(/어긋나지/);
  });

  it('글이 너무 길어지지 않게 전체 글자 수를 제한한다', () => {
    let book = CompanyBook.empty();
    for (const d of ['planning', 'marketing', 'design', 'quality', 'operations'] as const) book = book.with(entry(d, '가'.repeat(900)));
    expect(book.block()!.length).toBeLessThan(2400);
  });

  it('부서 순서(기획 → 디자인 → 마케팅 → 품질 → 운영)로 보여 준다', () => {
    const book = CompanyBook.empty().with(entry('operations', 'o')).with(entry('planning', 'p')).with(entry('marketing', 'm'));
    const text = book.block()!;
    expect(text.indexOf('기획·전략부')).toBeLessThan(text.indexOf('마케팅·그로스부'));
    expect(text.indexOf('마케팅·그로스부')).toBeLessThan(text.indexOf('운영·유지보수부'));
  });

  it('저장한 것을 다시 읽으면 같은 장부가 된다', () => {
    const book = CompanyBook.empty().with(entry('design', '톤은 따뜻하게'));
    expect(CompanyBook.of(book.entries).entries).toEqual(book.entries);
  });

  it('깨진 저장 내용은 버리고 읽을 수 있는 것만 쓴다', () => {
    const book = CompanyBook.read([{ department: 'hr', summary: 'x', at: 'y' }, { department: 'design', summary: '', at: 'z' }, { department: 'quality', summary: '보안 먼저', at: '2026-11-01T00:00:00.000Z' }, 3, null]);
    expect(book.entries.map((e) => e.department)).toEqual(['quality']);
  });
});

describe('CompanyBook.summaryOf', () => {
  it('살펴본 파일·실행한 명령 목록은 요약에서 뺀다', () => {
    const text = '■ 결론\n- 구독으로 간다\n\n■ 살펴본 파일\n- a.ts\n\n■ 실행한 명령\n- aws s3 ls';
    expect(CompanyBook.summaryOf(text, 500)).toBe('■ 결론\n- 구독으로 간다');
  });

  it('길면 줄 경계에서 자른다', () => {
    const text = ['첫째 줄 결론', '둘째 줄 근거', '셋째 줄 세부'].join('\n');
    expect(CompanyBook.summaryOf(text, 12)).toBe('첫째 줄 결론');
  });

  it('첫 줄 하나가 한도보다 길면 글자 수로 자르고 …를 붙인다', () => {
    expect(CompanyBook.summaryOf('가'.repeat(100), 10)).toBe('가'.repeat(9) + '…');
  });

  it('빈 줄을 하나로 줄인다', () => {
    expect(CompanyBook.summaryOf('a\n\n\n\nb', 100)).toBe('a\n\nb');
  });
});
