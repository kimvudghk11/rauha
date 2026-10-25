import { describe, expect, it } from 'vitest';
import { RouteDto } from './route.dto.js';

describe('RouteDto', () => {
  it('라우터 출력을 읽는다', () => {
    expect(RouteDto.read({ mode: 'question', refersToPast: true, pastQuery: '할인 discount' })).toEqual({ mode: 'question', refersToPast: true, pastQuery: '할인 discount' });
  });

  it('깨진 출력이면 작업으로 보고 지난 작업을 찾지 않는다', () => {
    expect(RouteDto.read({ mode: 'chat' })).toEqual({ mode: 'work', refersToPast: false, pastQuery: null });
    expect(RouteDto.read(null)).toEqual({ mode: 'work', refersToPast: false, pastQuery: null });
  });

  it('빈 검색어는 없음으로 본다', () => {
    expect(RouteDto.read({ mode: 'work', refersToPast: true, pastQuery: '  ' }).pastQuery).toBeNull();
  });
});
