import type { TurnOutcome } from '@rauha/core';
import { formatElapsed } from '../live-line.js';
import type { MascotView } from '../mascot.js';

/** 한 번의 입력 결과 → 화면에 고정해 둘 줄들. 작업은 끝 표정 + 읽기 안내서, 답은 답 + 확인된 근거 수. */
export function describeTurn(turn: TurnOutcome, view: MascotView | null): string[] {
  switch (turn.kind) {
    case 'work': {
      const { outcome } = turn;
      // 파일 하이퍼링크(OSC 8)는 Ink가 글자째 지워서, 대화 화면에서는 링크 없는 안내서를 쓴다.
      return [...(view !== null ? ['', view.finale(outcome.status)] : []), '', outcome.guide.toMarkdown(), ''];
    }
    case 'answer': {
      // 근거를 확인하지 못한 주장 목록은 답을 읽는 데 방해만 돼서 보여 주지 않는다(사용자 결정).
      const verified = turn.checked.filter((c) => !c.isGuess);
      return ['', turn.answer, '', `  근거 확인됨 ${verified.length}개 · ${formatElapsed(turn.durationMs)} · 추정 $${turn.costUsd.toFixed(3)}`, ''];
    }
    case 'blocked':
      if (turn.reason === 'login') return ['', 'Claude에 로그인되어 있지 않아요. /exit로 나가서 rauha login을 실행한 뒤 다시 와 주세요.', ''];
      return ['', `Claude 구독 사용 한도에 걸렸어요: ${turn.message}`, '한도가 풀린 뒤 다시 입력해 주세요.', ''];
  }
}
