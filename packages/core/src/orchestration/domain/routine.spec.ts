import { describe, expect, it } from 'vitest';
import { DomainError } from '../../shared/domain-error.js';
import { Routine, RoutineBook } from './routine.js';

// 2026-10-26 월, 10-28 수, 10-30 금, 11-01 일, 11-02 월, 11-03 화, 11-04 수, 11-09 월
const daily = (createdOn = '2026-10-30') => Routine.create({ id: 'r1', request: '릴리스 노트 초안', cadence: { kind: 'daily' }, today: createdOn });
const mondays = (createdOn = '2026-10-26') => Routine.create({ id: 'r2', request: '주간 점검', cadence: { kind: 'weekly', weekday: 1 }, today: createdOn });

describe('Routine', () => {
  it('요청이 비면 만들 수 없다', () => {
    expect(() => Routine.create({ id: 'x', request: '  ', cadence: { kind: 'daily' }, today: '2026-11-01' })).toThrow(DomainError);
  });

  it('매일 업무는 만든 날 다음 날부터 때가 된다', () => {
    expect(daily('2026-11-01').isDue('2026-11-01')).toBe(false);
    expect(daily('2026-11-01').isDue('2026-11-02')).toBe(true);
  });

  it('오늘 이미 했으면 때가 아니고, 다음 날 다시 때가 된다', () => {
    expect(daily().ranOn('2026-11-02').isDue('2026-11-02')).toBe(false);
    expect(daily().ranOn('2026-11-02').isDue('2026-11-03')).toBe(true);
  });

  it('매주 업무는 만든 날 뒤에 그 요일이 지났고 그 몫을 아직 안 했으면 때가 된다', () => {
    expect(mondays('2026-10-26').isDue('2026-11-01')).toBe(false); // 월요일에 만들었으니 그 주 월요일은 몫이 아니다
    expect(mondays('2026-10-26').isDue('2026-11-02')).toBe(true);
  });

  it('매주 업무는 요일이 오기 전에는 때가 아니다', () => {
    expect(mondays('2026-10-28').isDue('2026-11-01')).toBe(false);
    expect(mondays('2026-10-28').isDue('2026-11-02')).toBe(true);
  });

  it('요일을 지나서 처음 연 날에도 때가 되고, 한 번 하면 다음 주까지 조용하다', () => {
    const r = mondays('2026-10-28');
    expect(r.isDue('2026-11-04')).toBe(true);
    const done = r.ranOn('2026-11-04');
    expect(done.isDue('2026-11-05')).toBe(false);
    expect(done.isDue('2026-11-09')).toBe(true);
  });

  it('요일 이름으로 설명한다', () => {
    expect(daily().describe()).toBe('매일');
    expect(mondays().describe()).toBe('매주 월');
    expect(Routine.create({ id: 'x', request: 'a', cadence: { kind: 'weekly', weekday: 0 }, today: '2026-11-01' }).describe()).toBe('매주 일');
  });

  it('저장했다 읽으면 같다', () => {
    const r = mondays().ranOn('2026-11-02');
    expect(Routine.read(JSON.parse(JSON.stringify(r.toJSON())))?.toJSON()).toEqual(r.toJSON());
  });

  it('깨진 항목은 읽지 못한다', () => {
    expect(Routine.read({ id: 'x' })).toBeNull();
    expect(Routine.read({ id: 'x', request: 'a', cadence: { kind: 'weekly', weekday: 9 }, createdOn: '2026-11-01', lastRunOn: null })).toBeNull();
    expect(Routine.read(null)).toBeNull();
  });
});

describe('RoutineBook', () => {
  it('등록하고 번호로 지운다 (번호는 1부터)', () => {
    const book = RoutineBook.empty().add(daily()).add(mondays());
    expect(book.routines).toHaveLength(2);
    expect(book.remove(1).routines.map((r) => r.id)).toEqual(['r2']);
  });

  it('없는 번호를 지우려 하면 알린다', () => {
    expect(() => RoutineBook.empty().add(daily()).remove(3)).toThrow(DomainError);
  });

  it('열 개까지만 둔다 (정기 업무가 한도를 조용히 먹지 않게)', () => {
    let book = RoutineBook.empty();
    for (let i = 0; i < 10; i += 1) book = book.add(Routine.create({ id: `r${i}`, request: `일 ${i}`, cadence: { kind: 'daily' }, today: '2026-11-01' }));
    expect(() => book.add(daily())).toThrow(DomainError);
  });

  it('때가 된 것만 모으고, 실행했다고 표시한다', () => {
    const book = RoutineBook.empty().add(daily('2026-10-30')).add(mondays('2026-10-28'));
    expect(book.due('2026-11-01').map((r) => r.id)).toEqual(['r1']);
    expect(book.markRun(['r1'], '2026-11-01').due('2026-11-01')).toEqual([]);
  });

  it('깨진 저장 내용에서 읽을 수 있는 것만 읽는다', () => {
    expect(RoutineBook.read([daily().toJSON(), { id: 'bad' }, 7]).routines).toHaveLength(1);
  });
});
