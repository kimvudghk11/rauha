import { emitKeypressEvents } from 'node:readline';
import { createInterface } from 'node:readline/promises';
import type { Assumption, FactAnswer, PermissionAnswer, PermissionAsker, UserPort } from '@rauha/core';
import type { LiveLine } from './live-line.js';
import type { MascotView } from './mascot.js';
import { menuKey, menuLines, type Key } from './menu.js';

export type Asker = PermissionAsker;

const interactive = () => process.stdin.isTTY === true && process.stderr.isTTY === true;
const DENY: PermissionAnswer = { kind: 'deny', note: null };

/** 물을 화면이 없을 때(bench, 파이프): 위험 동작은 묻지 않고 거절한다. */
export function refuseAll(log: (line: string) => void): Asker {
  return async (request) => {
    log(`위험 동작 자동 거절 (물어볼 화면 없음): ${request.reason}: ${request.detail}`);
    return DENY;
  };
}

/** 여러 팀원 호출이 겹쳐도 터미널 질문은 한 번에 하나씩. */
function serialized<T>(): (task: () => Promise<T>) => Promise<T> {
  let queue: Promise<unknown> = Promise.resolve();
  return (task) => {
    const next = queue.then(task);
    queue = next.catch(() => undefined);
    return next;
  };
}

async function prompt(text: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return await rl.question(text);
  } finally {
    rl.close();
  }
}

/** ↑↓·숫자·Enter·Esc로 고르는 목록. 고른 번호(0부터), 취소면 -1. 목록 줄만 다시 그린다. */
async function select(options: readonly string[], highlight?: (text: string) => string): Promise<number> {
  const out = process.stderr;
  let index = 0;
  const draw = (again: boolean) => {
    if (again) out.write(`\x1b[${options.length}A`);
    for (const line of menuLines(options, index, highlight)) out.write(`\r\x1b[K${line}\n`);
  };
  draw(false);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve) => {
    const onKey = (_text: string, key: Key | undefined) => {
      const next = menuKey(index, key ?? {}, options.length);
      if (next.index >= 0 && next.index !== index) {
        index = next.index;
        draw(true);
      }
      if (!next.done) return;
      process.stdin.off('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve(next.index);
    };
    process.stdin.on('keypress', onKey);
  });
}

export const PERMISSION_OPTIONS = ['허락', '이번 실행 동안 이 명령은 계속 허락', '거절', '거절하고 이유 알려 주기'] as const;
export const PERMISSION_ANSWERED = ['허락했어요.', '이번 실행 동안 계속 허락해요.', '거절했어요.', '거절하고 이유를 전했어요.'] as const;

/** 고른 번호(-1 = 취소) → 허락 답. 이유는 4번을 골랐을 때만 쓴다. */
export function toPermissionAnswer(index: number, note: string | null): PermissionAnswer {
  if (index === 0) return { kind: 'allow' };
  if (index === 1) return { kind: 'allow-always' };
  const trimmed = note?.trim() ?? '';
  return index === 3 && trimmed !== '' ? { kind: 'deny', note: trimmed } : DENY;
}

export interface AskScreen {
  readonly view: MascotView | null;
  /** 질문하는 동안 멈출 작업 중 표시. 없으면 null. */
  readonly live: LiveLine | null;
  readonly log: (line: string) => void;
}

const pausing = <T>(live: LiveLine | null, task: () => Promise<T>) => (live === null ? task() : live.pause(task));

/**
 * 터미널에서 위험 동작 허락을 받는다. Claude Code처럼 박스로 무엇을 하려는지 보여 주고 목록에서 고른다.
 * stdin·stderr가 터미널이 아니면 refuseAll로 대신한다.
 */
export function terminalAsker(screen: AskScreen): Asker {
  if (!interactive()) return refuseAll(screen.log);
  const run = serialized<PermissionAnswer>();
  return (request) =>
    run(() =>
      pausing(screen.live, async () => {
        const columns = process.stderr.columns ?? 80;
        const shown = screen.view?.permission(request, columns) ?? `⚠ 위험 동작 허락? ${request.reason}\n  ${request.detail}`;
        process.stderr.write(`\n${shown}\n\n`);
        const index = await select(PERMISSION_OPTIONS, screen.view?.highlight);
        const note = index === 3 ? await prompt('  팀원에게 전할 이유: ') : null;
        const answer = toPermissionAnswer(index, note);
        process.stderr.write(`  → ${PERMISSION_ANSWERED[index < 0 ? 2 : index]}\n\n`);
        return answer;
      }),
    );
}

export const FACT_OPTIONS = ['맞아요', '틀려요 (바로잡을 내용 입력)', '모르겠어요 (추측으로 남김)'] as const;
export const FACT_ANSWERED = ['맞다고 기록했어요.', '정정을 넣어 다시 고칠게요.', '추측으로 남겨 둘게요.'] as const;

/** 고른 번호(-1 = Esc) → 추측 확인 답. 모르는데 맞다/틀리다를 고르면 그것도 추측이라 Esc는 '모르겠어요'. */
export function toFactAnswer(index: number, correction: string | null): FactAnswer {
  if (index === 0) return { kind: 'correct' };
  if (index === 1) return { kind: 'wrong', correction: correction?.trim() || '(사용자가 틀렸다고 함, 바로잡을 내용은 없음)' };
  return { kind: 'unsure' };
}

/** 해석이 갈리는 지점과 코드에 들어간 추측을 터미널에서 확인받는다. */
export function terminalUser(screen: Pick<AskScreen, 'view' | 'live'> = { view: null, live: null }): UserPort {
  if (!interactive()) return noUser;
  return {
    interactive: true,
    choose: (assumption: Assumption) =>
      pausing(screen.live, async () => {
        const options = [assumption.chosen, ...assumption.alternatives];
        const lines = options.map((o, i) => `  ${i + 1}) ${o}${i === 0 ? '  (추천)' : ''}`).join('\n');
        return parseChoice(await prompt(`\n? ${assumption.question}\n${lines}\n  번호 [1]: `), options.length);
      }),
    confirmFact: (claim) =>
      pausing(screen.live, async () => {
        const shown = screen.view?.factCheck(claim.text, process.stderr.columns ?? 80) ?? `? 근거를 확인하지 못했어요. 맞나요?\n  ${claim.text}`;
        process.stderr.write(`\n${shown}\n\n`);
        const index = await select(FACT_OPTIONS, screen.view?.highlight);
        const correction = index === 1 ? await prompt('  바로잡을 내용: ') : null;
        process.stderr.write(`  → ${FACT_ANSWERED[index < 0 ? 2 : index]}\n\n`);
        return toFactAnswer(index, correction);
      }),
    pickPast: (candidates) =>
      pausing(screen.live, async () => {
        const shown = screen.view?.pastPick(process.stderr.columns ?? 80) ?? '? 혹시 이 작업을 말씀하시는 건가요?';
        process.stderr.write(`
${shown}

`);
        const options = [...candidates.map((c) => `${c.title}  (${c.at.slice(0, 16).replace('T', ' ')})`), '아니요, 새 작업이에요'];
        const index = await select(options, screen.view?.highlight);
        return index >= 0 && index < candidates.length ? candidates[index]!.id : null;
      }),
  };
}

/** 사용자 입력(1부터 센 번호) → 선택 인덱스. Enter나 잘못된 입력은 추천(0). */
export function parseChoice(answer: string, count: number): number {
  const text = answer.trim();
  const n = Number(text);
  return text === '' || !Number.isInteger(n) || n < 1 || n > count ? 0 : n - 1;
}

/** bench처럼 물어볼 화면이 없는 실행. */
export const noUser: UserPort = { interactive: false, choose: async () => 0, confirmFact: async () => ({ kind: 'unsure' }), pickPast: async () => null };
