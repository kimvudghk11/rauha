/**
 * 이어서 묻기: Main 말풍선에 답장하거나, 태스크 안에서 그 팀에 후속 질문을 하면
 * 같은 레포에서 새 작업을 만들고, 그 태스크의 앞 대화 전체·일했던 팀원을 맥락으로 붙여 같은 팀이 이어서 일하게 한다.
 * 태스크 안에서 보낸 것은 그 태스크(thread)의 대화로 쌓이고 Main 에 새 카드로 뜨지 않는다.
 */
export const FOLLOW_TEXT_MAX = 20_000;
export const FOLLOW_RESULT_MAX = 4_000;
/** 맥락에 넣는 앞 대화 수(최근 것부터). 오래된 결과는 짧게 */
export const FOLLOW_TURNS_MAX = 6;
const OLD_RESULT_MAX = 800;

/** 묶음 계산에 필요한 작업 한 개(작업판·대화 기록 어느 쪽에서 와도 같은 모양) */
export interface ThreadTurn {
  readonly id: string;
  readonly request: string;
  readonly result: string | null;
  readonly cast: readonly string[];
  /** 이어진 작업이면 처음 태스크 id, 처음 태스크면 null */
  readonly thread: string | null;
  readonly queuedAt: string;
}

/** 화면에서 받은 새 말: 다듬고, 비었거나 너무 길면 null */
export function followUpText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  return t === '' || t.length > FOLLOW_TEXT_MAX ? null : t;
}

/** id 가 속한 태스크 묶음: 처음 태스크 + 이어진 것들, 시간 순. 없으면 [] */
export function threadOfTurns(all: readonly ThreadTurn[], id: string): ThreadTurn[] {
  const me = all.find((t) => t.id === id);
  if (me === undefined) return [];
  const root = me.thread ?? me.id;
  return all.filter((t) => t.id === root || t.thread === root).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

/** 묶음에서 일한 팀원(처음 나온 순, 팀장 intake 는 빼고) */
export function threadTeam(turns: readonly ThreadTurn[]): string[] {
  const seen: string[] = [];
  for (const t of turns) for (const r of t.cast) if (r !== 'intake' && !seen.includes(r)) seen.push(r);
  return seen;
}

const resultText = (result: string | null, max: number): string =>
  result === null || result.trim() === '' ? '(no result — that turn was stopped or gave no answer)' : result.length > max ? `${result.slice(0, max)}\n(cut)` : result;

/** 팀에 넘길 글: 앞 대화(오래된 것부터) + 일했던 팀원 + 새 말 */
export function followUpPrompt(turns: readonly { readonly request: string; readonly result: string | null }[], team: readonly string[], text: string): string {
  const kept = turns.slice(-FOLLOW_TURNS_MAX);
  const lines = ['This continues an earlier task in the same repo. Keep what was already done and build on it.'];
  if (turns.length > kept.length) lines.push(`(${turns.length - kept.length} earlier turns left out)`);
  if (team.length > 0) lines.push(`Team that has worked on this task: ${team.join(', ')}. Keep the same members on it; bring in another member only if this new part needs a skill they lack.`);
  kept.forEach((t, i) => {
    const last = i === kept.length - 1;
    lines.push('', `Earlier request${kept.length > 1 ? ` (${i + 1}/${kept.length})` : ''}:\n${t.request}`, '', `What the team reported back:\n${resultText(t.result, last ? FOLLOW_RESULT_MAX : OLD_RESULT_MAX)}`);
  });
  lines.push('', `Now the user says:\n${text}`);
  return lines.join('\n');
}
