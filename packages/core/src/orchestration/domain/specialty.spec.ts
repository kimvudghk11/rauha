import { describe, expect, it } from 'vitest';
import { Specialty } from './specialty.js';

describe('Specialty', () => {
  it('알려진 전문 분야만 남기고 중복과 모르는 이름은 버린다', () => {
    expect(Specialty.readAll(['backend', 'frontend', 'backend', 'cooking', 3, null])).toEqual(['backend', 'frontend']);
  });

  it('배열이 아니면 전문 분야 없음', () => {
    expect(Specialty.readAll(undefined)).toEqual([]);
    expect(Specialty.readAll('backend')).toEqual([]);
  });

  it('한 번에 최대 3개까지만 쓴다 (넓게 걸수록 지침이 흐려진다)', () => {
    expect(Specialty.readAll(['frontend', 'backend', 'database', 'architecture', 'infra'])).toEqual(['frontend', 'backend', 'database']);
  });

  it('지침 블록은 분야 이름과 지침을 담고, 없으면 빈 글이다', () => {
    expect(Specialty.block([])).toBe('');
    const block = Specialty.block(['database']);
    expect(block).toContain('<specialty>');
    expect(block).toContain('데이터베이스');
    expect(block).toMatch(/되돌릴 수 있|마이그레이션/);
  });

  it('분야마다 한국어 이름이 있다', () => {
    expect(Specialty.label('frontend')).toBe('프론트엔드');
    expect(Specialty.label('architecture')).toBe('설계·아키텍처');
  });
});
