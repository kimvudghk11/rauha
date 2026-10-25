import { describe, expect, it } from 'vitest';
import { describeTurn } from './describe-turn.js';

const claim = (text: string, isGuess: boolean) => ({ kind: 'fact' as const, text, evidence: [], verified: isGuess ? [] : [{ kind: 'record' as const, text: 'x' }], isGuess });

describe('describeTurn', () => {
  it('답은 답 글과 확인된 근거 수만 보여 주고, 추측 목록은 쓰지 않는다', () => {
    const text = describeTurn({ kind: 'answer', answer: '정한 해석 때문입니다.', checked: [claim('floor를 쓴다', false), claim('예전엔 round였다', true)], costUsd: 0.01, durationMs: 9000 }, null).join('\n');
    expect(text).toContain('정한 해석 때문입니다.');
    expect(text).toContain('근거 확인됨 1개');
    expect(text).not.toContain('추측');
    expect(text).not.toContain('예전엔 round였다');
  });

  it('답 글은 두 칸 들여 쓰고, ■ 제목 줄은 강조한다', () => {
    const view = { highlight: (t: string) => `<${t}>` } as unknown as Parameters<typeof describeTurn>[1];
    const lines = describeTurn({ kind: 'answer', answer: '요약입니다.\n\n■ 관리 주체\n- EC2는 직접 관리합니다.', checked: [], costUsd: 0, durationMs: 0 }, view);
    expect(lines).toContain('  요약입니다.');
    expect(lines).toContain('  <▍ 관리 주체>');
    expect(lines).toContain('  - EC2는 직접 관리합니다.');
  });

  it('실제로 열어 확인한 웹 문서는 맨 아래 출처로 한 번씩 짧게 보여 준다', () => {
    const web = (url: string) => ({ kind: 'fact' as const, text: 't', evidence: [], verified: [{ kind: 'web' as const, url, quote: 'q' }], isGuess: false });
    const url = 'https://docs.aws.amazon.com/AmazonECS/latest/developerguide/launch_types.html';
    const text = describeTurn({ kind: 'answer', answer: '답', checked: [web(url), web(url), claim('x', true)], costUsd: 0, durationMs: 0 }, null).join('\n');
    expect(text).toContain('출처');
    expect(text.match(/docs\.aws\.amazon\.com › /g)).toHaveLength(1);
    expect(text).toContain('docs.aws.amazon.com › AmazonECS/latest/developerguide/launch_types.html');
  });

  it('한도면 한도 문장을 그대로 보여 준다', () => {
    expect(describeTurn({ kind: 'blocked', reason: 'usage-limit', message: "You've hit your session limit · resets 9:40pm" }, null).join('\n')).toContain('resets 9:40pm');
  });

  it('로그인이 안 됐으면 로그인하는 명령을 알려 준다', () => {
    expect(describeTurn({ kind: 'blocked', reason: 'login', message: 'x' }, null).join('\n')).toContain('rauha login');
  });
});

describe('describeTurn — 작업', () => {
  it('작업이 끝나면 긴 안내서 대신 결과 카드를 창 너비로 그린다', () => {
    const cards: unknown[] = [];
    const view = {
      finale: () => 'FINALE',
      resultCard: (card: unknown, columns: number) => (cards.push(card), `CARD ${columns}`),
    } as unknown as Parameters<typeof describeTurn>[1];
    const guide = { toMarkdown: () => 'LONG GUIDE', stopMessage: () => null };
    const outcome = {
      status: 'complete',
      title: '할인',
      durationMs: 111_000,
      guide,
      changedInRun: [{ path: 'src/a.ts', kind: 'modified' }],
      assumptions: [{ question: '반올림?', chosen: '내림', alternatives: [], confirmed: false }],
      facts: { unconfirmed: [{ text: '필드 이름은 email' }] },
    };
    const lines = describeTurn({ kind: 'work', outcome } as unknown as Parameters<typeof describeTurn>[0], view);
    const card = lines.find((l) => typeof l === 'function') as (columns: number) => string;
    expect(card(80)).toBe('CARD 80');
    expect(cards[0]).toMatchObject({ status: 'complete', title: '할인', elapsed: '1분 51초', files: [{ path: 'src/a.ts' }], todo: ['반올림? → 내림', '필드 이름은 email'] });
    expect(lines.filter((l) => typeof l === 'string').join('\n')).not.toContain('LONG GUIDE');
  });

  it('대화 화면의 안내서는 하이퍼링크 없이 쓴다 (Ink가 링크 글자를 지운다)', () => {
    const guide = { toTerminal: () => '\u001b]8;;file:///E:/a.ts\u001b\\a.ts\u001b]8;;\u001b\\', toMarkdown: () => 'a.ts' };
    const turn = { kind: 'work', outcome: { status: 'complete', guide } } as unknown as Parameters<typeof describeTurn>[0];
    const text = describeTurn(turn, null).join('\n');
    expect(text).toContain('a.ts');
    expect(text).not.toContain('\u001b]8;;');
  });
});
