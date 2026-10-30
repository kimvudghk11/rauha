import { describe, expect, it } from 'vitest';
import { completeMention, mentionAt, suggestFiles } from './file-mention.js';

const files = ['README.md', 'src/money.ts', 'src/money.spec.ts', 'src/cart/cart.ts', 'docs/design/money-rules.md'];

describe('mentionAt', () => {
  it('커서 앞의 @단어를 찾는다 (글 맨 앞이거나 띄어쓰기 뒤의 @만)', () => {
    expect(mentionAt({ text: '@mon', cursor: 4 })).toEqual({ start: 0, query: 'mon' });
    expect(mentionAt({ text: '이거 @src/mo 고쳐줘', cursor: 10 })).toEqual({ start: 3, query: 'src/mo' });
  });

  it('@가 없거나 단어 중간의 @, 띄어쓰기를 지난 뒤는 아니다', () => {
    expect(mentionAt({ text: '고쳐줘', cursor: 3 })).toBeNull();
    expect(mentionAt({ text: 'a@b', cursor: 3 })).toBeNull();
    expect(mentionAt({ text: '@money 고쳐', cursor: 9 })).toBeNull();
  });
});

describe('suggestFiles', () => {
  it('파일 이름이 검색어로 시작하는 것을 먼저, 그다음 경로에 들어 있는 것을 보여 준다', () => {
    expect(suggestFiles('money', files)).toEqual(['src/money.ts', 'src/money.spec.ts', 'docs/design/money-rules.md']);
  });

  it('대소문자를 가리지 않고 최대 5개까지', () => {
    expect(suggestFiles('READ', files)).toEqual(['README.md']);
    expect(suggestFiles('', Array.from({ length: 9 }, (_, i) => `f${i}.ts`))).toHaveLength(5);
  });

  it('맞는 게 없으면 빈 목록', () => {
    expect(suggestFiles('zzz', files)).toEqual([]);
  });
});

describe('completeMention', () => {
  it('@검색어를 고른 파일 경로로 바꾸고 뒤에 띄어쓰기를 붙인다', () => {
    expect(completeMention({ text: '이거 @mon 고쳐줘', cursor: 7 }, { start: 3, query: 'mon' }, 'src/money.ts')).toEqual({ text: '이거 @src/money.ts  고쳐줘', cursor: 17 });
  });
});
