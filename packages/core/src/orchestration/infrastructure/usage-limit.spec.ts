import { describe, expect, it } from 'vitest';
import { usageLimitMessage } from './usage-limit.js';

describe('usageLimitMessage', () => {
  it('구독 한도 오류에서 풀리는 시각이 들어간 문장을 꺼낸다', () => {
    expect(usageLimitMessage("Claude Code returned an error result: You've hit your session limit · resets 5:40pm (Asia/Seoul)")).toBe(
      "You've hit your session limit · resets 5:40pm (Asia/Seoul)",
    );
    expect(usageLimitMessage("Claude Code returned an error result: You've hit your weekly limit · resets Mon 9am")).toBe("You've hit your weekly limit · resets Mon 9am");
  });

  it('한도와 상관없는 오류는 null', () => {
    expect(usageLimitMessage('error_max_turns: 턴 상한')).toBeNull();
    expect(usageLimitMessage(null)).toBeNull();
  });
});
