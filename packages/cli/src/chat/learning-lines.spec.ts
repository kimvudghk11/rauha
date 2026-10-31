import { LearningBook } from '@rauha/core';
import { describe, expect, it } from 'vitest';
import { learningLines } from './learning-lines.js';

const note = (pattern: string, what: string) => ({ pattern, what, why: '이유', at: '2026-11-01T00:00:00.000Z' });

describe('learningLines', () => {
  it('비었으면 어떻게 쌓이는지 알린다', () => {
    expect(learningLines(LearningBook.empty()).join('\n')).toContain('아직 모인 노트가 없어요');
  });

  it('패턴별로 몇 번 썼는지와 결정, 이유, 날짜를 보여 준다', () => {
    const text = learningLines(LearningBook.empty().add([note('전략(Strategy)', '할인 계산을 뺐다'), note('전략(Strategy)', '배송비를 뺐다'), note('팩토리(Factory)', '쿠폰 생성')])).join('\n');
    expect(text).toContain('패턴 2가지');
    expect(text).toContain('■ 전략(Strategy) · 2번');
    expect(text).toContain('할인 계산을 뺐다');
    expect(text).toContain('왜: 이유  (2026-11-01)');
    expect(text.indexOf('전략(Strategy)')).toBeLessThan(text.indexOf('팩토리(Factory)'));
  });

  it('패턴마다 최근 세 개까지만 보여 준다', () => {
    const notes = Array.from({ length: 5 }, (_, i) => note('전략(Strategy)', `결정 ${i}`));
    const text = learningLines(LearningBook.empty().add(notes)).join('\n');
    expect(text).not.toContain('결정 1');
    expect(text).toContain('결정 4');
  });
});
