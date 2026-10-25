import { describe, expect, it } from 'vitest';
import { EvidenceDto } from './evidence.dto.js';

const blank = { path: null, line: null, quote: null, name: null, url: null, text: null };

describe('EvidenceDto', () => {
  it('종류별 필수 칸이 빈 근거는 버린다', () => {
    const list = EvidenceDto.list(
      [
        { ...blank, kind: 'code', path: 'src/a.ts', line: 3, quote: 'return Money.of(x)' },
        { ...blank, kind: 'code', path: null, quote: 'return Money.of(x)' },
        { ...blank, kind: 'test', name: 'Money discount' },
        { ...blank, kind: 'web', url: 'https://docs.example.com' },
        { ...blank, kind: 'user', text: '   ' },
        { ...blank, kind: 'rumor', text: '들었음' },
      ],
      'decisions[0].evidence',
    );
    expect(list).toEqual([
      { kind: 'code', path: 'src/a.ts', line: 3, quote: 'return Money.of(x)' },
      { kind: 'test', name: 'Money discount' },
      { kind: 'web', url: 'https://docs.example.com', quote: null },
    ]);
  });

  it('근거 칸이 없거나 배열이 아니면 근거 없음으로 본다', () => {
    expect(EvidenceDto.list(undefined, 'x')).toEqual([]);
    expect(EvidenceDto.list('code', 'x')).toEqual([]);
  });
});
