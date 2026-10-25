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
