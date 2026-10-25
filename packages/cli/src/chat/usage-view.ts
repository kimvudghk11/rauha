import type { ModelTier, PlanUsage, UsageWindow } from '@rauha/core';
import { gaugeText } from '../gauge.js';

export interface SessionCalls {
  readonly calls: Readonly<Record<ModelTier, number>>;
  readonly costUsd: number;
}

/** 사용률 막대를 그리는 함수. 화면이 있으면 사용률에 따라 색을 입힌 것을 넘긴다. */
export type Gauge = (percent: number, cells: number) => string;

/** /usage 화면의 막대는 20칸, 입력창 아래 상태 줄의 막대는 6칸. */
const USAGE_CELLS = 20;
const STATUS_CELLS = 6;

function parts(date: Date, timeZone: string | undefined): Record<string, string> {
  const format = new Intl.DateTimeFormat('ko-KR', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return Object.fromEntries(format.formatToParts(date).map((p) => [p.type, p.value]));
}

/** 오늘 풀리면 "오후 10:50", 다른 날이면 "11월 1일 (일) 오전 3:00" */
function resetText(iso: string, now: Date, timeZone: string | undefined): string {
  const at = parts(new Date(iso), timeZone);
  const today = parts(now, timeZone);
  const time = `${at['dayPeriod']} ${at['hour']}:${at['minute']}`;
  const sameDay = at['year'] === today['year'] && at['month'] === today['month'] && at['day'] === today['day'];
  return sameDay ? time : `${at['month']}월 ${at['day']}일 (${at['weekday']}) ${time}`;
}

function windowLine(label: string, window: UsageWindow | null, now: Date, timeZone: string | undefined, gauge: Gauge): string {
  if (window === null) return `  ${label}  확인하지 못했어요`;
  const reset = window.resetsAt !== null ? ` · ${resetText(window.resetsAt, now, timeZone)}에 초기화` : '';
  return `  ${label}  ${gauge(window.percent, USAGE_CELLS)} ${String(Math.round(window.percent)).padStart(3)}%${reset}`;
}

/** /usage 화면. Claude Code /usage처럼 구독 사용률이 먼저고, API 요금으로 친 비용은 참고로만. */
export function usageLines(plan: PlanUsage | null, session: SessionCalls, now: Date, timeZone?: string, gauge: Gauge = gaugeText): string[] {
  const calls = (Object.entries(session.calls) as [ModelTier, number][]).filter(([, n]) => n > 0).map(([tier, n]) => `${tier} ${n}회`);
  const callText = calls.length > 0 ? `${calls.join(' · ')} (API 요금으로 치면 $${session.costUsd.toFixed(3)})` : '아직 없음';
  return [
    '',
    ...(plan === null
      ? ['  구독 사용률을 확인하지 못했어요. (로그인이 안 됐거나, 사용률을 알려 주지 않는 계정이에요)']
      : [windowLine('세션 (5시간)', plan.session, now, timeZone, gauge), windowLine('주간        ', plan.weekly, now, timeZone, gauge)]),
    `  이번 대화 호출: ${callText}`,
    '',
  ];
}

/** 입력창 아래 상태 줄: 프로필 · 세션 · 주간 · 브랜치. 모르는 값은 뺀다. */
export function statusLine(badge: string, plan: PlanUsage | null, branch: string | null, gauge?: Gauge): string {
  const part = (label: string, w: UsageWindow | null | undefined) =>
    w ? `${label} ${gauge ? `${gauge(w.percent, STATUS_CELLS)} ` : ''}${Math.round(w.percent)}%` : null;
  const items = [badge, part('세션', plan?.session), part('주간', plan?.weekly), branch];
  return items.filter((item): item is string => item !== null && item !== '').join(' · ');
}
