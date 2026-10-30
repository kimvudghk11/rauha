import type { InputState } from './input-line.js';

/** 입력창에 보여 주는 파일 후보 수 */
const MAX_SUGGESTIONS = 5;

export interface Mention {
  /** @가 있는 글자(코드 포인트) 자리 */
  readonly start: number;
  /** @ 뒤부터 커서까지 */
  readonly query: string;
}

/** 커서 바로 앞이 "@검색어"이면 그것을 돌려준다. @는 글 맨 앞이나 띄어쓰기 뒤에 있어야 하고, 검색어에는 띄어쓰기가 없다. */
export function mentionAt(state: InputState): Mention | null {
  const chars = [...state.text].slice(0, state.cursor);
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    const ch = chars[i]!;
    if (/\s/.test(ch)) return null;
    if (ch === '@') {
      if (i > 0 && !/\s/.test(chars[i - 1]!)) return null;
      return { start: i, query: chars.slice(i + 1).join('') };
    }
  }
  return null;
}

/** 검색어에 맞는 파일. 이름이 검색어로 시작하는 것, 경로가 시작하는 것, 경로에 들어 있는 것 순. */
export function suggestFiles(query: string, files: readonly string[]): string[] {
  const q = query.toLowerCase();
  const rank = (path: string): number => {
    const lower = path.toLowerCase();
    if (q === '') return 3;
    if (lower.slice(lower.lastIndexOf('/') + 1).startsWith(q)) return 0;
    if (lower.startsWith(q)) return 1;
    return lower.includes(q) ? 2 : -1;
  };
  return files
    .map((path, order) => ({ path, order, rank: rank(path) }))
    .filter((f) => f.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, MAX_SUGGESTIONS)
    .map((f) => f.path);
}

/** @검색어 자리를 고른 파일 경로로 바꾸고 커서를 그 뒤(띄어쓰기 다음)에 둔다. */
export function completeMention(state: InputState, mention: Mention, path: string): InputState {
  const chars = [...state.text];
  const inserted = [...`@${path} `];
  const next = [...chars.slice(0, mention.start), ...inserted, ...chars.slice(state.cursor)];
  return { text: next.join(''), cursor: mention.start + inserted.length };
}
