import { render } from 'ink';
import React from 'react';
import { ChatSession, GitWorkspace, type MemberRole, type PermissionAsker, type Profile, type UserPort } from '@rauha/core';
import { FACT_ANSWERED, FACT_OPTIONS, PERMISSION_ANSWERED, PERMISSION_OPTIONS, toFactAnswer, toPermissionAnswer } from '../ask.js';
import { formatElapsed } from '../live-line.js';
import { mascotView } from '../mascot.js';
import { createLoop, createTeam, loadPrompts, openMemory, roleSettings } from '../run.js';
import { ChatApp } from './chat-app.js';
import { ChatStore } from './chat-store.js';
import { HELP_TEXT, parseCommand } from './commands.js';
import { describeTurn } from './describe-turn.js';

export interface ChatOptions {
  readonly workDir: string;
  readonly profile: Profile;
  readonly home: string;
  readonly version: string;
  /** false면 리뷰·사실 점검 없이(--quick) */
  readonly threePass: boolean;
}

const columns = () => process.stderr.columns ?? 80;

/** rauha(인자 없음): Claude Code 같은 대화 화면. 화면이 없으면 열지 않는다. */
export async function runChat(options: ChatOptions): Promise<number> {
  if (process.stdin.isTTY !== true || process.stderr.isTTY !== true) {
    process.stdout.write('대화 모드는 터미널에서만 열 수 있어요. rauha -p "<요청>"을 쓰세요.\n');
    return 1;
  }
  const { workDir, profile, home } = options;
  const view = mascotView(process.stderr.getColorDepth(), `v${options.version}`, profile.badge());
  const store = new ChatStore();

  // 진행 알림 → 일하는 중 줄. role이 붙은 알림 = 그 팀원이 일을 시작함(앞 줄은 걸린 시간과 함께 고정).
  let working: { text: string; role: MemberRole; startedAt: number } | null = null;
  const finishWorking = () => {
    if (working === null) return;
    const elapsed = formatElapsed(Date.now() - working.startedAt);
    store.stopWorking(view?.done(working.text, working.role, elapsed) ?? `  ◆ ${working.text} ${elapsed}`);
    working = null;
  };
  const progress = {
    step: (message: string, role?: MemberRole) => {
      finishWorking();
      if (role === undefined) {
        store.print(view?.step(message) ?? `  · ${message}`);
        return;
      }
      working = { text: message, role, startedAt: Date.now() };
      store.startWorking(message, role, working.startedAt);
    },
  };

  const ask: PermissionAsker = async (request) => {
    const screen = view?.permission(request, columns()) ?? `⚠ 위험 동작 허락? ${request.reason}\n  ${request.detail}`;
    const index = (await store.ask({ kind: 'menu', screen, options: PERMISSION_OPTIONS })) as number;
    const note = index === 3 ? ((await store.ask({ kind: 'text', label: '팀원에게 전할 이유' })) as string) : null;
    store.print(`  → ${PERMISSION_ANSWERED[index < 0 ? 2 : index]}`);
    return toPermissionAnswer(index, note);
  };
  const user: UserPort = {
    interactive: true,
    choose: async (assumption) => {
      const options = [`${assumption.chosen}  (추천)`, ...assumption.alternatives];
      const index = (await store.ask({ kind: 'menu', screen: `? ${assumption.question}`, options })) as number;
      return index < 0 ? 0 : index;
    },
    confirmFact: async (claim) => {
      const screen = view?.factCheck(claim.text, columns()) ?? `? 근거를 확인하지 못했어요. 맞나요?\n  ${claim.text}`;
      const index = (await store.ask({ kind: 'menu', screen, options: FACT_OPTIONS })) as number;
      const correction = index === 1 ? ((await store.ask({ kind: 'text', label: '바로잡을 내용' })) as string) : null;
      store.print(`  → ${FACT_ANSWERED[index < 0 ? 2 : index]}`);
      return toFactAnswer(index, correction);
    },
    pickPast: async (candidates) => {
      const screen = view?.pastPick(columns()) ?? '? 혹시 이 작업을 말씀하시는 건가요?';
      const options = [...candidates.map((c) => `${c.title}  (${c.at.slice(0, 16).replace('T', ' ')})`), '아니요, 새 작업이에요'];
      const index = (await store.ask({ kind: 'menu', screen, options })) as number;
      return index >= 0 && index < candidates.length ? candidates[index]!.id : null;
    },
  };

  const prompts = await loadPrompts();
  const ctx = { root: workDir, profile, home, ask, user, progress, requireClean: true, threePass: options.threePass };
  const team = createTeam(ctx, prompts);
  const memory = openMemory(ctx);
  const session = ChatSession.start({
    newLoop: (carried) => createLoop(ctx, prompts, team, carried),
    team,
    workspace: new GitWorkspace(workDir),
    memory,
    user,
    progress,
    roles: roleSettings(),
    now: Date.now,
    newId: () => crypto.randomUUID(),
    today: () => new Date().toISOString().slice(0, 10),
  });

  const app = render(
    React.createElement(ChatApp, {
      store,
      banner: (width: number) => view?.banner(workDir, width) ?? `${profile.badge()} ${workDir}`,
      view,
      onSubmit: (text: string) => void handle(text),
    }),
    { stdout: process.stderr, exitOnCtrlC: true },
  );

  async function handle(text: string): Promise<void> {
    const command = parseCommand(text);
    if (command !== null) {
      switch (command.kind) {
        case 'clear':
          session.clear();
          store.print('  대화를 비웠어요. 지난 작업 기억은 남아 있어요.');
          return;
        case 'status': {
          const s = session.status();
          store.print(`  대화 ${s.turns}번 · 이어 일할 파일 ${s.carriedFiles}개 · 마지막 작업: ${s.lastTitle ?? '없음'}`);
          return;
        }
        case 'usage': {
          const u = session.usage();
          store.print(`  이번 세션: haiku ${u.calls.haiku}회 · sonnet ${u.calls.sonnet}회 · opus ${u.calls.opus}회 · 추정 $${u.costUsd.toFixed(3)}`);
          return;
        }
        case 'help':
          store.print(HELP_TEXT);
          return;
        case 'exit':
          app.unmount();
          return;
        case 'unknown':
          store.print(`  ${command.name}는 없는 명령이에요. /help로 명령을 볼 수 있어요.`);
          return;
      }
    }
    store.print(`\n> ${text}`);
    store.setBusy(true);
    try {
      const turn = await session.handle(text);
      finishWorking();
      for (const line of describeTurn(turn, view)) store.print(line);
    } catch (error) {
      finishWorking();
      store.print(`rauha: ${(error as Error).message}`);
    } finally {
      store.setBusy(false);
    }
  }

  await app.waitUntilExit();
  memory.close();
  return 0;
}
