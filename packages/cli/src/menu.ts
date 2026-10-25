export { wrapText } from './text-width.js';

export interface Key {
  readonly name?: string;
  readonly sequence?: string;
  readonly ctrl?: boolean;
}

/** 선택 목록에서 키 하나를 처리한다. index -1 + done = 취소(Esc, Ctrl+C). */
export function menuKey(index: number, key: Key, count: number): { index: number; done: boolean } {
  if (key.name === 'escape' || (key.ctrl === true && key.name === 'c')) return { index: -1, done: true };
  if (key.name === 'up' || key.name === 'k') return { index: (index - 1 + count) % count, done: false };
  if (key.name === 'down' || key.name === 'j') return { index: (index + 1) % count, done: false };
  if (key.name === 'return' || key.name === 'enter') return { index, done: true };
  const digit = Number(key.sequence);
  if (Number.isInteger(digit) && digit >= 1 && digit <= count) return { index: digit - 1, done: true };
  return { index, done: false };
}

/** Claude Code 허락 화면처럼 고른 줄에만 ❯를 붙인다. highlight는 고른 줄 색칠. */
export function menuLines(options: readonly string[], selected: number, highlight: (text: string) => string = (t) => t): string[] {
  return options.map((option, i) => (i === selected ? `  ${highlight(`❯ ${i + 1}. ${option}`)}` : `    ${i + 1}. ${option}`));
}
