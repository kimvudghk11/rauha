type CommandName = 'clear' | 'status' | 'usage' | 'guide' | 'help' | 'exit';

export type ChatCommand = { readonly kind: CommandName } | { readonly kind: 'unknown'; readonly name: string };

export interface CommandHelp {
  readonly name: string;
  readonly help: string;
}

/** 명령과 설명. /help와 '/'를 쳤을 때 뜨는 목록이 같은 것을 쓴다. */
const COMMANDS: readonly { readonly kind: CommandName; readonly help: string }[] = [
  { kind: 'clear', help: '지금 대화를 비워요. 지난 작업 기억은 남아요.' },
  { kind: 'status', help: '지금 세션 상태(대화 수, 이어 일할 파일)' },
  { kind: 'usage', help: '구독 사용률(세션 5시간 · 주간)과 이번 대화 호출 수' },
  { kind: 'guide', help: '지난 작업의 자세한 읽기 안내서' },
  { kind: 'help', help: '이 안내' },
  { kind: 'exit', help: '끝내기 (Ctrl+C 두 번도 됨)' },
];

/** `/`로 시작하는 입력을 명령으로 읽는다. 명령이 아니면 null(요청으로 보낸다). */
export function parseCommand(text: string): ChatCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const name = trimmed.split(/\s+/)[0]!;
  const known = COMMANDS.find((c) => `/${c.kind}` === name.toLowerCase());
  return known !== undefined ? { kind: known.kind } : { kind: 'unknown', name };
}

/** 입력창에 '/'로 시작하는 글을 치는 동안 보여 줄 명령 후보. 띄어쓰기가 들어가면 다 친 것으로 본다. */
export function suggestCommands(text: string): CommandHelp[] {
  if (!text.startsWith('/') || /\s/.test(text)) return [];
  return COMMANDS.filter((c) => `/${c.kind}`.startsWith(text.toLowerCase())).map((c) => ({ name: `/${c.kind}`, help: c.help }));
}

export const HELP_TEXT = ['명령', ...COMMANDS.map((c) => `  ${`/${c.kind}`.padEnd(9)} ${c.help}`), '그 밖의 글은 요청이나 질문으로 보내요.'].join('\n');
