import { describe, expect, it } from 'vitest';
import { gaugeLevel, gaugeParts, gaugeText } from './gauge.js';

describe('gaugeText', () => {
  it('0%는 얇은 레일만, 100%는 채운 칸만', () => {
    expect(gaugeText(0, 10)).toBe('▁▁▁▁▁▁▁▁▁▁');
    expect(gaugeText(100, 10)).toBe('▄▄▄▄▄▄▄▄▄▄');
    expect(gaugeText(50, 10)).toBe('▄▄▄▄▄▁▁▁▁▁');
  });

  it('칸 수로 반올림하고, 조금이라도 썼으면 한 칸은 채운다', () => {
    expect(gaugeText(83, 20)).toBe(`${'▄'.repeat(17)}${'▁'.repeat(3)}`);
    expect(gaugeText(21, 20)).toBe(`${'▄'.repeat(4)}${'▁'.repeat(16)}`);
    expect(gaugeText(1, 10)).toBe('▄▁▁▁▁▁▁▁▁▁');
  });

  it('범위를 벗어나거나 숫자가 아니면 0~100으로 맞춘다', () => {
    expect(gaugeText(-5, 4)).toBe('▁▁▁▁');
    expect(gaugeText(250, 4)).toBe('▄▄▄▄');
    expect(gaugeText(Number.NaN, 4)).toBe('▁▁▁▁');
  });

  it('칸 수는 언제나 같다 (줄이 어긋나지 않게)', () => {
    for (let p = 0; p <= 100; p += 7) expect([...gaugeText(p, 20)]).toHaveLength(20);
  });
});

describe('gaugeParts', () => {
  it('채운 부분과 빈 부분을 나눠 준다 (색을 따로 입히려고)', () => {
    expect(gaugeParts(83, 10)).toEqual({ filled: '▄▄▄▄▄▄▄▄', track: '▁▁' });
  });
});

describe('gaugeLevel', () => {
  it('70% 미만은 평소, 90% 미만은 주의, 그 이상은 위험', () => {
    expect(gaugeLevel(10)).toBe('normal');
    expect(gaugeLevel(69.9)).toBe('normal');
    expect(gaugeLevel(70)).toBe('warn');
    expect(gaugeLevel(89)).toBe('warn');
    expect(gaugeLevel(90)).toBe('critical');
    expect(gaugeLevel(100)).toBe('critical');
  });
});
