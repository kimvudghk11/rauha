import { describe, expect, it } from 'vitest';
import { DB_CHOICES, detectedDbs, hiringInputOf } from './hiring-input.js';

describe('채용 검토실 입력(연차·직무·DB) 검사', () => {
  it('연차는 0~40 정수(반올림), 직무는 정해진 것 또는 any', () => {
    expect(hiringInputOf({ years: 3.6, role: 'backend', dbs: [] })).toEqual({ years: 4, role: 'backend', dbs: [], desiredSalary: null });
    expect(hiringInputOf({ years: 0, role: 'any', dbs: [] })?.years).toBe(0);
    expect(hiringInputOf({ years: -1, role: 'any', dbs: [] })).toBeNull();
    expect(hiringInputOf({ years: 41, role: 'any', dbs: [] })).toBeNull();
    expect(hiringInputOf({ years: '3', role: 'any', dbs: [] })).toBeNull();
    expect(hiringInputOf({ years: 3, role: 'ceo', dbs: [] })).toBeNull();
  });
  it('DB 는 다듬어 한 번씩, 12개까지, 40자 넘거나 제어 문자가 든 것은 버린다', () => {
    const r = hiringInputOf({ years: 2, role: 'any', dbs: [' MySQL ', 'MySQL', 'x'.repeat(41), 'a\nb', 'Oracle', 7] });
    expect(r?.dbs).toEqual(['MySQL', 'Oracle']);
    expect(hiringInputOf({ years: 2, role: 'any', dbs: Array.from({ length: 20 }, (_, i) => `db${i}`) })?.dbs).toHaveLength(12);
  });
  it('모양이 틀리면 null', () => {
    expect(hiringInputOf(null)).toBeNull();
    expect(hiringInputOf({ years: 1, role: 'any' })?.dbs).toEqual([]);
  });
});

describe('희망 연봉(선택, 만 원)', () => {
  it('1,000 ~ 100,000 만 원만 받고, 그 밖·숫자가 아니면 없는 것으로', () => {
    expect(hiringInputOf({ years: 3, role: 'any', dbs: [], desiredSalary: 5200.4 })?.desiredSalary).toBe(5200);
    expect(hiringInputOf({ years: 3, role: 'any', dbs: [], desiredSalary: 52 })?.desiredSalary).toBeNull();
    expect(hiringInputOf({ years: 3, role: 'any', dbs: [], desiredSalary: '5200' })?.desiredSalary).toBeNull();
  });
});

describe('git 에서 찾은 DB', () => {
  it('설정 파일 스택 중 DB 만 고른다(미리 체크해 둘 것)', () => {
    expect(detectedDbs(['React', 'PostgreSQL', 'Redis', 'Vitest'])).toEqual(['PostgreSQL', 'Redis']);
    expect(DB_CHOICES).toContain('MySQL');
  });
});
