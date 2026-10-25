import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatElapsed, LiveLine } from './live-line.js';

describe('formatElapsed', () => {
  it('1분 전에는 초만, 그 뒤에는 분과 초로 쓴다', () => {
    expect(formatElapsed(0)).toBe('0초');
    expect(formatElapsed(12_400)).toBe('12초');
    expect(formatElapsed(65_000)).toBe('1분 5초');
  });
});

describe('LiveLine', () => {
  let out: string[];
  let now: number;
  const line = () =>
    new LiveLine({
      write: (s) => out.push(s),
      now: () => now,
      working: (frame, text, elapsed) => `${frame} ${text} ${elapsed}`,
      done: (text, elapsed) => `= ${text} ${elapsed}`,
      intervalMs: 100,
    });
  const screen = () => out.join('');

  beforeEach(() => {
    out = [];
    now = 0;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('일하는 동안 같은 줄에서 스피너와 경과 시간을 갱신한다', () => {
    const live = line();
    live.start('팀장');
    now = 2_000;
    vi.advanceTimersByTime(100);
    expect(screen()).toBe('\r\x1b[K▖ 팀장 0초\r\x1b[K▘ 팀장 2초');
    live.stop();
  });

  it('멈추면 마지막 줄을 끝난 모양으로 고정하고 줄을 바꾼다', () => {
    const live = line();
    live.start('팀장');
    now = 34_000;
    live.stop();
    expect(screen().endsWith('\r\x1b[K= 팀장 34초\n')).toBe(true);
    out = [];
    vi.advanceTimersByTime(500);
    expect(screen()).toBe('');
  });

  it('새 일을 시작하면 앞의 일을 끝난 모양으로 고정한다', () => {
    const live = line();
    live.start('팀장');
    now = 3_000;
    live.start('테스트');
    expect(screen()).toContain('= 팀장 3초\n');
    expect(screen().endsWith('▖ 테스트 0초')).toBe(true);
    live.stop();
  });

  it('도는 중에 다른 줄을 찍으면 그 줄을 위에 쓰고 스피너를 아래에 다시 그린다', () => {
    const live = line();
    live.start('팀장');
    out = [];
    live.print('알림');
    expect(screen()).toBe('\r\x1b[K알림\n\r\x1b[K▖ 팀장 0초');
    live.stop();
  });

  it('질문하는 동안에는 스피너를 지우고 멈췄다가, 끝나면 다시 그린다', async () => {
    const live = line();
    live.start('팀장');
    out = [];
    const answer = await live.pause(async () => {
      vi.advanceTimersByTime(1_000);
      return 42;
    });
    expect(answer).toBe(42);
    expect(screen()).toBe('\r\x1b[K\r\x1b[K▖ 팀장 0초');
    live.stop();
  });
});
