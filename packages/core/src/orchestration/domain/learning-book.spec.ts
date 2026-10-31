import { describe, expect, it } from 'vitest';
import { LearningBook } from './learning-book.js';

const AT = '2026-11-01T00:00:00.000Z';
const decision = (what: string, why: string) => ({ what, why });

describe('LearningBook.notesFrom', () => {
  it('패턴 이름과 패턴이라는 말이 함께 있는 결정을 노트로 뽑는다', () => {
    const notes = LearningBook.notesFrom([decision('할인 계산을 전략 패턴(Strategy)으로 뺐다', '쿠폰 종류마다 규칙이 달라 if가 늘어나는 것을 막는다')], AT);
    expect(notes).toEqual([{ pattern: '전략(Strategy)', what: '할인 계산을 전략 패턴(Strategy)으로 뺐다', why: '쿠폰 종류마다 규칙이 달라 if가 늘어나는 것을 막는다', at: AT }]);
  });

  it('패턴 이야기가 아닌 결정은 거른다 (retry strategy, git repository 같은 일반 말)', () => {
    expect(LearningBook.notesFrom([decision('재시도 strategy를 3회로 했다', '네트워크가 불안정해서')], AT)).toEqual([]);
    expect(LearningBook.notesFrom([decision('git repository 루트에서 읽는다', '경로가 상대적이라')], AT)).toEqual([]);
  });

  it('한 결정이 패턴을 둘 말하면 패턴마다 하나씩 만든다', () => {
    const notes = LearningBook.notesFrom([decision('Repository 패턴 위에 어댑터 패턴으로 외부 API를 감쌌다', '바깥 변화가 안으로 번지지 않게')], AT);
    expect(notes.map((n) => n.pattern).sort()).toEqual(['리포지토리(Repository)', '어댑터(Adapter)'].sort());
  });

  it('아키텍처 이야기도 담는다', () => {
    const notes = LearningBook.notesFrom([decision('도메인은 바깥을 import하지 않는 계층형 아키텍처를 따랐다', '규칙을 테스트하기 쉽게')], AT);
    expect(notes[0]?.pattern).toBe('계층형·클린·헥사고날 아키텍처');
  });
});

describe('LearningBook', () => {
  const note = (pattern: string, what: string) => ({ pattern, what, why: '이유', at: AT });

  it('같은 패턴·같은 결정은 한 번만 남긴다', () => {
    const book = LearningBook.empty().add([note('전략(Strategy)', 'A')]).add([note('전략(Strategy)', 'A'), note('전략(Strategy)', 'B')]);
    expect(book.notes).toHaveLength(2);
  });

  it('패턴별로 모아 자주 쓴 패턴부터 보여 준다', () => {
    const book = LearningBook.empty().add([note('팩토리(Factory)', 'A'), note('전략(Strategy)', 'B'), note('전략(Strategy)', 'C')]);
    expect(book.byPattern().map((g) => [g.pattern, g.notes.length])).toEqual([['전략(Strategy)', 2], ['팩토리(Factory)', 1]]);
  });

  it('이백 개를 넘으면 오래된 것부터 버린다', () => {
    const many = Array.from({ length: 205 }, (_, i) => note('전략(Strategy)', `결정 ${i}`));
    const book = LearningBook.empty().add(many);
    expect(book.notes).toHaveLength(200);
    expect(book.notes[0]?.what).toBe('결정 5');
  });

  it('저장한 것을 다시 읽고, 깨진 항목은 버린다', () => {
    const book = LearningBook.empty().add([note('전략(Strategy)', 'A')]);
    expect(LearningBook.read([...book.notes, { pattern: 3 }, null]).notes).toEqual(book.notes);
  });
});
