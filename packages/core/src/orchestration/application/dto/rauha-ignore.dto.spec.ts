import { describe, expect, it } from 'vitest';
import { RauhaIgnoreDto } from './rauha-ignore.dto.js';

describe('RauhaIgnoreDto', () => {
  it('빈 줄과 주석은 버리고 나머지 패턴을 기본 목록에 더한다', () => {
    const policy = RauhaIgnoreDto.from('# 비밀\n\n  secrets/**  \nprod.json\n').toEntity();
    expect(policy.isSecret('secrets/a.txt')).toBe(true);
    expect(policy.isSecret('prod.json')).toBe(true);
    expect(policy.isSecret('.env')).toBe(true);
  });

  it('파일이 없으면 기본 목록만', () => {
    expect(RauhaIgnoreDto.from(null).toEntity().isSecret('prod.json')).toBe(false);
  });
});
