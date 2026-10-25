import type { MemberRole } from '@rauha/core';
import { formatElapsed } from '../live-line.js';
import type { MascotView } from '../mascot.js';
import type { ChatStore } from './chat-store.js';

/** 질문을 나누고 답하는 팀원. 사용자에게는 한 가지 "작업 중"으로 보이고, 끝나도 줄을 남기지 않는다(답이 곧 결과). */
const QUIET: ReadonlySet<MemberRole> = new Set(['router', 'answerer']);

/**
 * 진행 알림 → 대화 화면. role이 붙은 알림 = 그 팀원이 일을 시작함(앞 팀원 줄은 걸린 시간과 함께 고정).
 * finish는 한 번의 입력이 끝났을 때 남은 작업 중 줄을 정리한다.
 */
export function chatProgress(store: ChatStore, view: MascotView | null, now: () => number) {
  let working: { text: string; role: MemberRole; startedAt: number } | null = null;
  const finish = () => {
    if (working === null) return;
    const elapsed = formatElapsed(now() - working.startedAt);
    store.stopWorking(QUIET.has(working.role) ? null : (view?.done(working.text, working.role, elapsed) ?? `  ◆ ${working.text} ${elapsed}`));
    working = null;
  };
  return {
    finish,
    step: (message: string, role?: MemberRole) => {
      // 라우터 → 답변 팀원은 같은 작업 중 줄을 이어 간다.
      if (role !== undefined && QUIET.has(role) && working !== null && QUIET.has(working.role)) {
        working = { ...working, role };
        return;
      }
      finish();
      if (role === undefined) {
        store.print(view?.step(message) ?? `  · ${message}`);
        return;
      }
      working = { text: message, role, startedAt: now() };
      store.startWorking(message, role, working.startedAt);
    },
  };
}
