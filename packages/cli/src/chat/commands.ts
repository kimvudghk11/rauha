export type ChatCommand = { readonly kind: 'clear' | 'status' | 'usage' | 'help' | 'exit' } | { readonly kind: 'unknown'; readonly name: string };

const KNOWN = new Set(['clear', 'status', 'usage', 'help', 'exit']);

/** `/`로 시작하는 입력을 명령으로 읽는다. 명령이 아니면 null(요청으로 보낸다). */
export function parseCommand(text: string): ChatCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const name = trimmed.split(/\s+/)[0]!.toLowerCase();
  const bare = name.slice(1);
  return KNOWN.has(bare) ? { kind: bare as 'clear' | 'status' | 'usage' | 'help' | 'exit' } : { kind: 'unknown', name: trimmed.split(/\s+/)[0]! };
}

export const HELP_TEXT = [
  '명령',
  '  /clear    지금 대화를 비워요. 지난 작업 기억은 남아요.',
  '  /status   지금 세션 상태(대화 수, 이어 일할 파일)',
  '  /usage    이번 세션에서 쓴 모델 호출과 추정 비용',
  '  /help     이 안내',
  '  /exit     끝내기 (Ctrl+C 두 번도 됨)',
  '그 밖의 글은 요청이나 질문으로 보내요.',
].join('\n');
