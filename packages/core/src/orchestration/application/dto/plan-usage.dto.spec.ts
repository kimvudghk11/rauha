import { describe, expect, it } from 'vitest';
import { PlanUsageDto } from './plan-usage.dto.js';

const raw = {
  subscription_type: 'pro',
  rate_limits_available: true,
  rate_limits: {
    five_hour: { utilization: 83, resets_at: '2026-10-25T13:50:00.018545+00:00' },
    seven_day: { utilization: 21, resets_at: '2026-10-31T18:00:00.018565+00:00' },
    seven_day_opus: null,
  },
};

describe('PlanUsageDto', () => {
  it('세션(5시간)과 주간 사용률, 초기화 시각을 읽는다', () => {
    expect(PlanUsageDto.from(raw)).toEqual({
      plan: 'pro',
      session: { percent: 83, resetsAt: '2026-10-25T13:50:00.018545+00:00' },
      weekly: { percent: 21, resetsAt: '2026-10-31T18:00:00.018565+00:00' },
    });
  });

  it('구독 한도가 없는 계정(API 키 등)이면 null', () => {
    expect(PlanUsageDto.from({ subscription_type: null, rate_limits_available: false, rate_limits: null })).toBeNull();
  });

  it('창 하나가 비어 있거나 모양이 틀리면 그 창만 null로 둔다', () => {
    const usage = PlanUsageDto.from({ ...raw, rate_limits: { five_hour: { utilization: 'x' }, seven_day: raw.rate_limits.seven_day } });
    expect(usage?.session).toBeNull();
    expect(usage?.weekly?.percent).toBe(21);
  });

  it('응답이 객체가 아니면 null (실험 중인 SDK 기능이라 모양이 바뀔 수 있다)', () => {
    expect(PlanUsageDto.from('nope')).toBeNull();
  });
});
