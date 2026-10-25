import { describe, expect, it } from 'vitest';
import { describeTurn } from './describe-turn.js';

const claim = (text: string, isGuess: boolean) => ({ kind: 'fact' as const, text, evidence: [], verified: isGuess ? [] : [{ kind: 'record' as const, text: 'x' }], isGuess });

describe('describeTurn', () => {
  it('답은 답 글 뒤에 확인된 근거 수와 추측을 따로 보여 준다', () => {
    const text = describeTurn({ kind: 'answer', answer: '정한 해석 때문입니다.', checked: [claim('floor를 쓴다', false), claim('예전엔 round였다', true)], costUsd: 0.01, durationMs: 9000 }, null).join('\n');
    expect(text).toContain('정한 해석 때문입니다.');
    expect(text).toContain('근거 확인됨 1개');
    expect(text).toContain('⚠ 추측 (근거 확인 안 됨)');
    expect(text).toContain('예전엔 round였다');
    expect(text).not.toContain('- floor를 쓴다');
  });

  it('추측이 없으면 추측 절을 쓰지 않는다', () => {
    const text = describeTurn({ kind: 'answer', answer: '네.', checked: [claim('a', false)], costUsd: 0, durationMs: 0 }, null).join('\n');
    expect(text).not.toContain('추측');
  });

  it('한도면 한도 문장을 그대로 보여 준다', () => {
    expect(describeTurn({ kind: 'limited', message: "You've hit your session limit · resets 9:40pm" }, null).join('\n')).toContain('resets 9:40pm');
  });
});

describe('describeTurn — 작업', () => {
  it('대화 화면의 안내서는 하이퍼링크 없이 쓴다 (Ink가 링크 글자를 지운다)', () => {
    const guide = { toTerminal: () => '\u001b]8;;file:///E:/a.ts\u001b\\a.ts\u001b]8;;\u001b\\', toMarkdown: () => 'a.ts' };
    const turn = { kind: 'work', outcome: { status: 'complete', guide } } as unknown as Parameters<typeof describeTurn>[0];
    const text = describeTurn(turn, null).join('\n');
    expect(text).toContain('a.ts');
    expect(text).not.toContain('\u001b]8;;');
  });
});
