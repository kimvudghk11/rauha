import { describe, expect, it } from 'vitest';
import { MarketDto } from './market.dto.js';

const good = {
  profiles: [
    { industry: '핀테크', role: 'backend', stacks: [['Kotlin', 'Spring', 'Kafka']], extras: ['대용량 트래픽'], companies: ['어느핀테크'], sources: [{ title: '서버 개발자 공고', url: 'https://jobs.example.com/1' }] },
  ],
};

describe('실제 공고 시장 정보 읽기(웹에서 온 값은 믿지 않고 거른다)', () => {
  it('정해진 업종·직무만, 날짜를 붙여 읽는다', () => {
    const m = MarketDto.from(good, '2026-11-15');
    expect(m.checkedAt).toBe('2026-11-15');
    expect(m.profiles).toHaveLength(1);
    expect(m.profiles[0]!.stacks[0]).toEqual(['Kotlin', 'Spring', 'Kafka']);
  });
  it('모르는 업종·직무, 스택 없는 항목은 버린다', () => {
    const m = MarketDto.from({ profiles: [{ ...good.profiles[0], industry: '우주' }, { ...good.profiles[0], role: 'ceo' }, { ...good.profiles[0], stacks: [] }] }, '2026-11-15');
    expect(m.profiles).toEqual([]);
  });
  it('출처는 https 링크만, 글자 수·개수는 상한까지', () => {
    const m = MarketDto.from({ profiles: [{ ...good.profiles[0], sources: [{ title: 'x', url: 'javascript:alert(1)' }, { title: 'y', url: 'http://plain.example.com' }, { title: 'z', url: 'https://ok.example.com/a' }], stacks: [['a'.repeat(200), 'Go']] }] }, '2026-11-15');
    expect(m.profiles[0]!.sources).toEqual([{ title: 'z', url: 'https://ok.example.com/a' }]);
    expect(m.profiles[0]!.stacks[0]).toEqual(['Go']);
  });
  it('저장한 것을 다시 읽어도 같다(날짜 포함)', () => {
    const m = MarketDto.from(good, '2026-11-15');
    expect(MarketDto.fromSaved(JSON.parse(JSON.stringify(m)))).toEqual(m);
    expect(MarketDto.fromSaved({ checkedAt: 'nope', profiles: [] })).toBeNull();
  });
});
