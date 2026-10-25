import { describe, expect, it } from 'vitest';
import { parkingStream } from './cursor-park.js';

function fakeStream() {
  const writes: string[] = [];
  const stream = { columns: 80, write: (data: string) => (writes.push(data), true) } as unknown as NodeJS.WriteStream;
  return { stream, writes };
}

describe('parkingStream', () => {
  it('자리를 정하면 진짜 커서를 그 자리로 옮겨 보이게 한다 (한글 조합 글자가 거기 그려진다)', () => {
    const { stream, writes } = fakeStream();
    const { park } = parkingStream(stream);
    park.set({ up: 2, column: 6 });
    expect(writes.join('')).toBe('\x1b[2A\x1b[7G\x1b[?25h');
  });

  it('화면을 다시 쓰기 전에는 커서를 원래 자리로 돌리고, 쓴 뒤 다시 옮긴다', () => {
    const { stream, writes } = fakeStream();
    const { stream: wrapped, park } = parkingStream(stream);
    park.set({ up: 2, column: 6 });
    writes.length = 0;
    wrapped.write('화면');
    expect(writes.join('')).toBe('\x1b[2B\r화면\x1b[2A\x1b[7G');
  });

  it('자리를 바꾸면 원래 자리를 거쳐 새 자리로 간다', () => {
    const { stream, writes } = fakeStream();
    const { park } = parkingStream(stream);
    park.set({ up: 2, column: 6 });
    writes.length = 0;
    park.set({ up: 1, column: 3 });
    expect(writes.join('')).toBe('\x1b[2B\r\x1b[1A\x1b[4G');
  });

  it('자리를 비우면 커서를 원래 자리로 돌리고 숨긴다', () => {
    const { stream, writes } = fakeStream();
    const { stream: wrapped, park } = parkingStream(stream);
    park.set({ up: 2, column: 6 });
    writes.length = 0;
    park.set(null);
    wrapped.write('x');
    expect(writes.join('')).toBe('\x1b[2B\r\x1b[?25lx');
  });

  it('감싼 스트림도 원래 스트림의 너비를 그대로 알려 준다', () => {
    const { stream } = fakeStream();
    expect(parkingStream(stream).stream.columns).toBe(80);
  });
});
