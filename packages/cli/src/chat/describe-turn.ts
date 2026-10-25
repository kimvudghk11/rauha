import type { TurnOutcome } from '@rauha/core';
import { formatElapsed } from '../live-line.js';
import type { MascotView } from '../mascot.js';

/** 한 번의 입력 결과 → 화면에 고정해 둘 줄들. 작업은 끝 표정 + 읽기 안내서, 답은 답 + 근거·추측. */
export function describeTurn(turn: TurnOutcome, view: MascotView | null): string[] {
  switch (turn.kind) {
    case 'work': {
      const { outcome } = turn;
      // 파일 하이퍼링크(OSC 8)는 Ink가 글자째 지워서, 대화 화면에서는 링크 없는 안내서를 쓴다.
      return [...(view !== null ? ['', view.finale(outcome.status)] : []), '', outcome.guide.toMarkdown(), ''];
    }
    case 'answer': {
      const verified = turn.checked.filter((c) => !c.isGuess);
      const guesses = turn.checked.filter((c) => c.isGuess);
      return [
        '',
        turn.answer,
        '',
        `  근거 확인됨 ${verified.length}개 · ${formatElapsed(turn.durationMs)} · 추정 $${turn.costUsd.toFixed(3)}`,
        ...(guesses.length > 0 ? ['', '⚠ 추측 (근거 확인 안 됨)', ...guesses.map((c) => `  - ${c.text}`)] : []),
        '',
      ];
    }
    case 'limited':
      return ['', `Claude 구독 사용 한도에 걸렸어요: ${turn.message}`, '한도가 풀린 뒤 다시 입력해 주세요.', ''];
  }
}
