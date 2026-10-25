import { describe, expect, it } from 'vitest';
import { accountBlock, usageLimitMessage } from './usage-limit.js';

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

describe('accountBlock', () => {
  it('로그인이 안 된 오류는 로그인 필요로 본다', () => {
    expect(accountBlock('Claude Code returned an error result: Not logged in · Please run /login')).toMatchObject({ reason: 'login' });
    expect(accountBlock('authentication_failed: Invalid API key')).toMatchObject({ reason: 'login' });
  });

  it('사용 한도 오류는 한도 문장과 함께 사용 한도로 본다', () => {
    expect(accountBlock("You've hit your session limit · resets 5:40pm")).toEqual({ reason: 'usage-limit', message: "You've hit your session limit · resets 5:40pm" });
  });

  it('그 밖의 오류는 null', () => {
    expect(accountBlock('error_max_turns')).toBeNull();
    expect(accountBlock(null)).toBeNull();
  });
});
