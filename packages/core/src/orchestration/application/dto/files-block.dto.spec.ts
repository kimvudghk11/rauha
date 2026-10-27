import { describe, expect, it } from 'vitest';
import { FilesBlockDto } from './files-block.dto.js';

describe('FilesBlockDto', () => {
  it('파일 내용을 Read와 같은 줄 번호를 붙여 <files>로 묶는다', () => {
    const block = FilesBlockDto.of([{ path: 'src/money.ts', content: 'a\nb' }]).toBlock();
    expect(block).toContain('<files>');
    expect(block).toContain('<file path="src/money.ts">\n1\ta\n2\tb\n</file>');
  });

  it('없는 파일은 빼고, 같은 파일은 한 번만 넣는다', () => {
    const block = FilesBlockDto.of([
      { path: 'a.ts', content: 'x' },
      { path: 'gone.ts', content: null },
      { path: 'a.ts', content: 'x' },
    ]).toBlock();
    expect(block.match(/<file path=/g)).toHaveLength(1);
    expect(block).not.toContain('gone.ts');
  });

  it('넣을 파일이 없으면 빈 문자열', () => {
    expect(FilesBlockDto.of([{ path: 'gone.ts', content: null }]).toBlock()).toBe('');
  });

  it('긴 파일은 앞부분만 넣고 나머지는 직접 열라고 적는다', () => {
    const block = FilesBlockDto.of([{ path: 'big.ts', content: 'x'.repeat(20_000) }]).toBlock();
    expect(block.length).toBeLessThan(13_000);
    expect(block).toContain('잘렸습니다');
  });

  it('전체 상한을 넘는 파일은 내용 없이 경로만 알린다', () => {
    const files = Array.from({ length: 6 }, (_, i) => ({ path: `f${i}.ts`, content: 'y'.repeat(11_000) }));
    const block = FilesBlockDto.of(files).toBlock();
    expect(block.length).toBeLessThan(42_000);
    expect(block).toContain('f5.ts');
    expect(block.match(/<file path=/g)!.length).toBeLessThan(6);
  });
});
