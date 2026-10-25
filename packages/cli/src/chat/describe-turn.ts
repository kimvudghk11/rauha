import type { TurnOutcome } from '@rauha/core';
import { formatElapsed } from '../live-line.js';
import type { MascotView } from '../mascot.js';
import type { Printable } from './chat-store.js';

/**
 * 답변 팀원이 쓴 "■ 제목" 줄을 강조한다. ■는 한글 글꼴 cmd에서 두 칸으로 그려져 줄이 어긋나서,
 * 어디서나 한 칸인 ▍로 바꾼다.
 */
function titled(line: string, view: MascotView | null): string {
  if (!line.startsWith('■ ') || view === null) return line;
  return view.highlight(`▍ ${line.slice(2)}`);
}

/** https://docs.aws.amazon.com/a/b.html → "docs.aws.amazon.com › a/b.html". 모양이 틀리면 그대로. */
function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/+|\/+$/g, '');
    return path === '' ? u.host : `${u.host} › ${path}`;
  } catch {
    return url;
  }
}

/** 한 번의 입력 결과 → 화면에 고정해 둘 줄들. 작업은 끝 표정 + 읽기 안내서, 답은 답 + 확인된 근거 수. */
export function describeTurn(turn: TurnOutcome, view: MascotView | null): Printable[] {
  switch (turn.kind) {
    case 'work': {
      const { outcome } = turn;
      // 화면이 없으면 안내서 전체. 파일 하이퍼링크(OSC 8)는 Ink가 글자째 지워서 링크 없는 안내서를 쓴다.
      if (view === null) return ['', outcome.guide.toMarkdown(), ''];
      // 긴 안내서 대신 결과 카드. 안내서 전체는 /guide로 본다.
      const card = {
        status: outcome.status,
        title: outcome.title,
        elapsed: formatElapsed(outcome.durationMs),
        stopMessage: outcome.guide.stopMessage(),
        files: outcome.changedInRun,
        todo: [...outcome.assumptions.filter((a) => !a.confirmed).map((a) => `${a.question} → ${a.chosen}`), ...outcome.facts.unconfirmed.map((c) => c.text)],
      };
      return ['', view.finale(outcome.status), '', (columns: number) => view.resultCard(card, columns), ''];
    }
    case 'answer': {
      // 근거를 확인하지 못한 주장 목록은 답을 읽는 데 방해만 돼서 보여 주지 않는다(사용자 결정).
      const verified = turn.checked.filter((c) => !c.isGuess);
      const sources = [...new Set(verified.flatMap((c) => c.verified.flatMap((e) => (e.kind === 'web' ? [shortUrl(e.url)] : []))))];
      return [
        '',
        ...turn.answer.split('\n').map((line) => (line === '' ? '' : `  ${titled(line, view)}`)),
        '',
        ...(sources.length > 0 ? ['  출처', ...sources.map((s) => `  - ${s}`), ''] : []),
        `  근거 확인됨 ${verified.length}개 · ${formatElapsed(turn.durationMs)} · 추정 $${turn.costUsd.toFixed(3)}`,
        '',
      ];
    }
    case 'blocked':
      if (turn.reason === 'login') return ['', 'Claude에 로그인되어 있지 않아요. /exit로 나가서 rauha login을 실행한 뒤 다시 와 주세요.', ''];
      return ['', `Claude 구독 사용 한도에 걸렸어요: ${turn.message}`, '한도가 풀린 뒤 다시 입력해 주세요.', ''];
  }
}
