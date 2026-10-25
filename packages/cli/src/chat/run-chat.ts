import { render } from 'ink';
import React from 'react';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ChatSession, GitWorkspace, readPlanUsage, type PermissionAsker, type PlanUsage, type Profile, type UserPort } from '@rauha/core';
import { FACT_ANSWERED, FACT_OPTIONS, PERMISSION_ANSWERED, PERMISSION_OPTIONS, toFactAnswer, toPermissionAnswer } from '../ask.js';
import { mascotView } from '../mascot.js';
import { createNotifier, NOTIFY_AFTER_MS, notifyWhile } from '../notify.js';
import { createLoop, createTeam, definedEnv, loadPrompts, openMemory, roleSettings } from '../run.js';
import { ChatApp } from './chat-app.js';
import { chatProgress } from './chat-progress.js';
import { ChatStore } from './chat-store.js';
import { HELP_TEXT, parseCommand } from './commands.js';
import { parkingStream } from './cursor-park.js';
import { describeTurn } from './describe-turn.js';
import { startRefreshing } from './status-refresh.js';
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
/** 쉬는 중 Ctrl+C를 두 번 눌러 끝낼 때 두 번째를 기다리는 시간 */
const EXIT_WINDOW_MS = 2000;
/** 상태 줄의 사용률을 다시 읽는 간격 */
const USAGE_REFRESH_MS = 60_000;

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

  const askPermission: PermissionAsker = async (request) => {
    const screen = view?.permission(request, columns()) ?? `⚠ 위험 동작 허락? ${request.reason}\n  ${request.detail}`;
    const compactScreen = view?.permission(request, columns(), true);
    const index = (await store.ask({ kind: 'menu', screen, compactScreen, options: PERMISSION_OPTIONS })) as number;
    const note = index === 3 ? ((await store.ask({ kind: 'text', label: '팀원에게 전할 이유' })) as string) : null;
    store.print(`  → ${PERMISSION_ANSWERED[index < 0 ? 2 : index]}`);
    return toPermissionAnswer(index, note);
  };
  const asker: UserPort = {
    interactive: true,
    choose: async (assumption) => {
      const options = [`${assumption.chosen}  (추천)`, ...assumption.alternatives];
      const index = (await store.ask({ kind: 'menu', screen: `? ${assumption.question}`, options })) as number;
      return index < 0 ? 0 : index;
    },
    confirmFact: async (claim) => {
      const screen = view?.factCheck(claim.text, columns()) ?? `? 근거를 확인하지 못했어요. 맞나요?\n  ${claim.text}`;
      const compactScreen = view?.factCheck(claim.text, columns(), true);
      const index = (await store.ask({ kind: 'menu', screen, compactScreen, options: FACT_OPTIONS })) as number;
      const correction = index === 1 ? ((await store.ask({ kind: 'text', label: '바로잡을 내용' })) as string) : null;
      store.print(`  → ${FACT_ANSWERED[index < 0 ? 2 : index]}`);
      return toFactAnswer(index, correction);
    },
    pickPast: async (candidates) => {
      const screen = view?.pastPick(columns()) ?? '? 혹시 이 작업을 말씀하시는 건가요?';
      const options = [...candidates.map((c) => `${c.title}  (${c.at.slice(0, 16).replace('T', ' ')})`), '아니요, 새 작업이에요'];
      const compactScreen = view?.pastPick(columns(), true);
      const index = (await store.ask({ kind: 'menu', screen, compactScreen, options })) as number;
      return index >= 0 && index < candidates.length ? candidates[index]!.id : null;
    },
  };

  // 사용자가 바로 답하지 않는 질문은 운영체제 알림으로도 알린다(바로 답하면 알림은 뜨지 않는다).
  const notifier = createNotifier();
  const asking = <T>(body: string, task: () => Promise<T>) => notifyWhile(notifier, NOTIFY_AFTER_MS, `${profile.badge()} 선택이 필요해요`, body, task);
  const ask: PermissionAsker = (request) => asking(`${request.tool} 실행 허락: ${request.detail}`, () => askPermission(request));
  const user: UserPort = {
    interactive: true,
    choose: (assumption) => asking(`요청의 해석을 정해 주세요: ${assumption.question}`, () => asker.choose(assumption)),
    confirmFact: (claim) => asking(`근거를 못 찾은 사실이 맞는지 알려 주세요: ${claim.text}`, () => asker.confirmFact(claim)),
    pickPast: (candidates) => asking('이 작업이 맞는지 알려 주세요', () => asker.pickPast(candidates)),
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
      onInterrupt: () => interrupt(),
      cursor: screen.park,
    }),
    { stdout: screen.stream, exitOnCtrlC: false },
  );

  // Ctrl+C: 일하는 중이면 그 작업만 멈춘다(팀원 호출을 끊고 기다리던 질문은 거절로 닫는다).
  // 쉬는 중이면 2초 안에 한 번 더 눌러야 끝난다.
  let lastInterrupt = 0;
  function interrupt(): void {
    if (store.busy) {
      team.cancel();
      store.cancelPrompts();
      store.print('  멈추는 중이에요…');
      return;
    }
    if (Date.now() - lastInterrupt < EXIT_WINDOW_MS) {
      app.unmount();
      return;
    }
    lastInterrupt = Date.now();
    store.print('  한 번 더 Ctrl+C를 누르면 끝나요.');
  }

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
          await usageTimer.now();
          store.printLines(usageLines(plan, session.usage(), new Date(), undefined, view?.gauge));
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
    team.resume();
    store.setBusy(true);
    try {
      const turn = await session.handle(text);
      if (turn.kind === 'work') lastGuide = turn.outcome.guide.toMarkdown();
      finishWorking();
      store.printLines(describeTurn(turn, view));
    } catch (error) {
      finishWorking();
      store.print(`rauha: ${(error as Error).message}`);
    } finally {
      store.setBusy(false);
      void usageTimer.now();
    }
  }

  // 상태 줄: 시작할 때, 입력 하나가 끝날 때, 그리고 입력이 없어도 1분마다 사용률을 새로 읽는다(모델을 부르지 않는다).
  // 세션 한도가 풀린 뒤에도 옛 퍼센트가 남아 있지 않게 하려고. 읽기에 실패하면 마지막으로 읽은 값을 그대로 둔다.
  const agentEnv = { ...definedEnv(process.env), ...profile.agentEnv(home) };
  let plan: PlanUsage | null = null;
  const usageTimer = startRefreshing(async () => {
    const [usage, branch] = await Promise.all([readPlanUsage(agentEnv), currentBranch(workDir)]);
    plan = usage ?? plan;
    store.setStatus(statusLine(profile.badge(), plan, branch, view?.gauge));
  }, USAGE_REFRESH_MS);

  await app.waitUntilExit();
  usageTimer.stop();
  memory.close();
  return 0;
}
