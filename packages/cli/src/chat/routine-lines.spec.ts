import { Routine, RoutineBook } from '@rauha/core';
import { describe, expect, it } from 'vitest';
import { dueNotice, routineLines } from './routine-lines.js';

const book = RoutineBook.empty()
  .add(Routine.create({ id: 'a', request: '릴리스 노트 초안', cadence: { kind: 'daily' }, today: '2026-10-30' }))
  .add(Routine.create({ id: 'b', request: '주간 점검', cadence: { kind: 'weekly', weekday: 1 }, today: '2026-10-28' }));

describe('routineLines', () => {
  it('비었으면 사용법과, 자동으로 돌지 않는다는 것을 알린다', () => {
    const text = routineLines(RoutineBook.empty(), '2026-11-01').join('\n');
    expect(text).toContain('/routine add');
    expect(text).toContain('자동으로 돌지 않아요');
  });

  it('번호와 주기와 요청을 보여 주고 때가 된 것을 표시한다', () => {
    const lines = routineLines(book, '2026-11-01');
    expect(lines.find((l) => l.includes('1. 매일'))).toContain('지금 할 때');
    expect(lines.find((l) => l.includes('2. 매주 월'))).not.toContain('지금 할 때');
    expect(lines.find((l) => l.includes('2. 매주 월'))).toContain('아직 안 함');
  });
});

describe('dueNotice', () => {
  it('때가 된 것이 있으면 목록과 실행 방법을 알린다', () => {
    const notice = dueNotice(book, '2026-11-01')!;
    expect(notice[0]).toContain('1개');
    expect(notice.join('\n')).toContain('릴리스 노트 초안');
  });

  it('때가 된 것이 없으면 아무 말도 하지 않는다', () => {
    expect(dueNotice(book.markRun(['a'], '2026-11-01'), '2026-11-01')).toBeNull();
    expect(dueNotice(RoutineBook.empty(), '2026-11-01')).toBeNull();
  });
});
