/**
 * 사용률 막대: 채운 칸은 아래 반만 차는 ▄, 빈 칸은 얇은 레일 ▁.
 * 꽉 찬 █는 줄 높이를 다 채워서 위아래 줄의 막대가 한 덩어리로 붙고, 점무늬 ░는 지저분해 보여서 쓰지 않는다.
 * 한글 글꼴 cmd에서도 한 칸으로 그려지는 글자만 쓴다(테두리의 ▁와 Delfi의 ▄).
 */
const FILLED = '▄';
const TRACK = '▁';

export type GaugeLevel = 'normal' | 'warn' | 'critical';

/** 퍼센트에 따른 단계: 70% 미만은 평소, 90% 미만은 주의, 그 이상은 위험. 색을 고르는 데 쓴다. */
export function gaugeLevel(percent: number): GaugeLevel {
  if (percent >= 90) return 'critical';
  if (percent >= 70) return 'warn';
  return 'normal';
}

/** 막대를 채운 부분과 빈 부분으로 나눠 만든다. 칸 수로 반올림하되, 조금이라도 썼으면 한 칸은 채운다. */
export function gaugeParts(percent: number, cells: number): { filled: string; track: string } {
  const clamped = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  const rounded = Math.round((clamped / 100) * cells);
  const used = clamped > 0 ? Math.max(1, rounded) : 0;
  return { filled: FILLED.repeat(used), track: TRACK.repeat(cells - used) };
}

/** 색 없는 막대 글. 화면이 색을 못 쓰거나 테스트에서 쓴다. */
export function gaugeText(percent: number, cells: number): string {
  const { filled, track } = gaugeParts(percent, cells);
  return filled + track;
}
