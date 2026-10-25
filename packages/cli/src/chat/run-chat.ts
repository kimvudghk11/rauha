import { render } from 'ink';
import React from 'react';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ChatSession, GitWorkspace, readPlanUsage, type PermissionAsker, type PlanUsage, type Profile, type UserPort } from '@rauha/core';
import { FACT_ANSWERED, FACT_OPTIONS, PERMISSION_ANSWERED, PERMISSION_OPTIONS, toFactAnswer, toPermissionAnswer } from '../ask.js';
import { mascotView } from '../mascot.js';
import { createLoop, createTeam, definedEnv, loadPrompts, openMemory, roleSettings } from '../run.js';
import { ChatApp } from './chat-app.js';
import { chatProgress } from './chat-progress.js';
import { ChatStore } from './chat-store.js';
import { HELP_TEXT, parseCommand } from './commands.js';
import { parkingStream } from './cursor-park.js';
import { describeTurn } from './describe-turn.js';
import { statusLine, usageLines } from './usage-view.js';

export interface ChatOptions {
  readonly workDir: string;
  readonly profile: Profile;
  readonly home: string;
  readonly version: string;
  /** false면 리뷰·사실 점검 없이(--quick) */
  readonly threePass: boolean;
}

const columns = () => process.stderr.columns ?? 80;

/** 지금 브랜치 이름. git이 없거나 실패하면 null. */
async function currentBranch(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await promisify(execFile)('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** rauha(인자 없음): Claude Code 같은 대화 화면. 화면이 없으면 열지 않는다. */
export async function runChat(options: ChatOptions): Promise<number> {
  if (process.stdin.isTTY !== true || process.stderr.isTTY !== true) {
    process.stdout.write('대화 모드는 터미널에서만 열 수 있어요. rauha -p "<요청>"을 쓰세요.\n');
    return 1;
  }
  const { workDir, profile, home } = options;
  const view = mascotView(process.stderr.getColorDepth(), `v${options.version}`, profile.badge());
  const store = new ChatStore();

  const progress = chatProgress(store, view, Date.now);
  const finishWorking = progress.finish;

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
  /** 마지막 작업의 읽기 안내서. 결과 카드 대신 자세히 볼 때 /guide로 연다. */
  let lastGuide: string | null = null;
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

  const screen = parkingStream(process.stderr);
  const app = render(
    React.createElement(ChatApp, {
      store,
      banner: (width: number) => view?.banner(workDir, width) ?? `${profile.badge()} ${workDir}`,
      view,
      onSubmit: (text: string) => void handle(text),
      cursor: screen.park,
    }),
    { stdout: screen.stream, exitOnCtrlC: true },
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
        case 'usage':
          await refreshStatus();
          for (const line of usageLines(plan, session.usage(), new Date())) store.print(line);
          return;
        case 'guide':
          store.print(lastGuide !== null ? `\n${lastGuide}\n` : '  아직 끝난 작업이 없어요.');
          return;
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
      if (turn.kind === 'work') lastGuide = turn.outcome.guide.toMarkdown();
      finishWorking();
      for (const line of describeTurn(turn, view)) store.print(line);
    } catch (error) {
      finishWorking();
      store.print(`rauha: ${(error as Error).message}`);
    } finally {
      store.setBusy(false);
      void refreshStatus();
    }
  }

  // 상태 줄: 시작할 때와 입력 하나가 끝날 때마다 사용률을 새로 읽는다(모델을 부르지 않는다).
  const agentEnv = { ...definedEnv(process.env), ...profile.agentEnv(home) };
  let plan: PlanUsage | null = null;
  const refreshStatus = async () => {
    const [usage, branch] = await Promise.all([readPlanUsage(agentEnv), currentBranch(workDir)]);
    plan = usage;
    store.setStatus(statusLine(profile.badge(), plan, branch));
  };
  void refreshStatus();

  await app.waitUntilExit();
  memory.close();
  return 0;
}
