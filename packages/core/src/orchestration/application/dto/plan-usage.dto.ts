/** 구독 사용률 창 하나. percent는 0~100, resetsAt은 ISO 시각(모르면 null). */
export interface UsageWindow {
  readonly percent: number;
  readonly resetsAt: string | null;
}

/** Claude 구독의 세션(5시간)·주간 사용률. Claude Code의 /usage와 같은 값. */
export interface PlanUsage {
  readonly plan: string | null;
  readonly session: UsageWindow | null;
  readonly weekly: UsageWindow | null;
}

/**
 * SDK의 /usage 응답 → 구독 사용률. 이 SDK 기능은 실험 중이라 모양이 바뀔 수 있어서,
 * 읽을 수 없는 부분은 오류 대신 null로 둔다.
 */
export class PlanUsageDto {
  private constructor() {}

  static from(input: unknown): PlanUsage | null {
    if (typeof input !== 'object' || input === null) return null;
    const o = input as Record<string, unknown>;
    if (o['rate_limits_available'] !== true || typeof o['rate_limits'] !== 'object' || o['rate_limits'] === null) return null;
    const limits = o['rate_limits'] as Record<string, unknown>;
    return {
      plan: typeof o['subscription_type'] === 'string' ? o['subscription_type'] : null,
      session: readWindow(limits['five_hour']),
      weekly: readWindow(limits['seven_day']),
    };
  }
}

function readWindow(input: unknown): UsageWindow | null {
  if (typeof input !== 'object' || input === null) return null;
  const w = input as Record<string, unknown>;
  if (typeof w['utilization'] !== 'number') return null;
  return { percent: w['utilization'], resetsAt: typeof w['resets_at'] === 'string' ? w['resets_at'] : null };
}
