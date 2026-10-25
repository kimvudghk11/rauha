import type { AccountBlock } from '../application/ports.js';

/** "You've hit your session limit · resets 5:40pm (Asia/Seoul)" 같은 구독 한도 문장 */
const LIMIT = /You['’]ve hit your [\w ]*limit[^\n]*/i;

/**
 * 팀원 호출 오류가 구독 사용 한도 때문인지. 그렇다면 풀리는 시각이 든 문장을, 아니면 null.
 * 한도에 걸린 뒤에는 몇 번을 다시 불러도 같은 오류라서, 서비스가 바로 멈추는 데 쓴다.
 */
export function usageLimitMessage(error: string | null): string | null {
  if (error === null) return null;
  return LIMIT.exec(error)?.[0].trim() ?? null;
}

/** Claude Code가 로그인이 안 됐거나 인증이 풀렸을 때 내는 오류 */
const LOGIN = /Not logged in|Please run \/login|authentication_failed|Invalid API key|OAuth token (?:has )?expired/i;

/** 팀원 호출 오류가 계정 문제(사용 한도, 로그인 안 됨)인지. 아니면 null. */
export function accountBlock(error: string | null): AccountBlock | null {
  const limit = usageLimitMessage(error);
  if (limit !== null) return { reason: 'usage-limit', message: limit };
  if (error !== null && LOGIN.test(error)) return { reason: 'login', message: '이 프로필은 Claude에 로그인되어 있지 않습니다.' };
  return null;
}
