import { render } from 'ink';
import React from 'react';
import { execFile, spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  ChatSession,
  DesignService,
  discoverRepos,
  FileChatSnapshots,
  FileDesignStore,
  FileWorkspaceStore,
  GitWorkspace,
  isRepo,
  loadSecretPolicy,
  Workspace,
  WorkspaceSession,
  type ChatSnapshot,
  type DesignUserPort,
  type RepoSession,
  type WorkspaceRepo,
  readPlanUsage, type PermissionAsker, type PlanUsage, type Profile, type UserPort } from '@rauha/core';
import { FACT_ANSWERED, FACT_OPTIONS, PERMISSION_ANSWERED, PERMISSION_OPTIONS, toFactAnswer, toPermissionAnswer } from '../ask.js';
import { readLoginStatus } from '../login-status.js';
import { mascotView } from '../mascot.js';
import { createNotifier, NOTIFY_AFTER_MS, notifyWhile } from '../notify.js';
import { createKnowledge, createLoop, createTeam, definedEnv, loadPrompts, openMemory, projectRoot, roleSettings } from '../run.js';
import { ChatApp } from './chat-app.js';
import { chatProgress } from './chat-progress.js';
import { ChatStore } from './chat-store.js';
import { HELP_TEXT, parseCommand, type ChatCommand } from './commands.js';
import { parkingStream } from './cursor-park.js';
import { describeTurn } from './describe-turn.js';
import { isRauhaRepo, nodeExec, relaunch, repoRoot, runUpdate, withContinue } from '../update.js';
import { startRefreshing } from './status-refresh.js';
import { statusLine, usageLines } from './usage-view.js';

export interface ChatOptions {
  readonly workDir: string;
  readonly profile: Profile;
  readonly home: string;
  readonly version: string;
  /** false면 리뷰·사실 점검 없이(--quick) */
  readonly threePass: boolean;
  /** 지난 대화를 이어서 연다(--continue) */
  readonly resume: boolean;
  /** 저장소마다 계정(프로필) 고르기. 폴더 규칙(config.toml)을 그 저장소 경로에 적용한다. */
  readonly profileFor: (root: string) => Profile;
}

const NO_CURRENT = '  어느 저장소인지 먼저 정해 주세요. /repo <이름>으로 고를 수 있어요.';

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
    discuss: (q) =>
      asking(`설계 질문에 답해 주세요: ${q.question}`, async () => {
        store.printLines(['', `  ? 설계 질문 ${q.round}: ${q.question}`]);
        if (q.suggestion !== null) store.print(`    추천: ${q.suggestion}`);
        store.print('    (Enter 또는 "알아서 해" = 추천대로, /cancel = 설계 그만두기)');
        const text = ((await store.ask({ kind: 'text', label: '답' })) as string).trim();
        return text.toLowerCase() === '/cancel' ? null : text;
      }),
    approve: (plan) =>
      asking(`설계를 보고 승인해 주세요: ${plan.title}`, async () => {
        store.printLines(['', ...plan.summary, `  설계 문서: ${plan.path} (직접 고쳐도 돼요)`, '']);
        const index = (await store.ask({ kind: 'menu', screen: '? 이 설계로 진행할까요?', options: ['승인하고 시작', '고칠 점 말하기', '그만두기'] })) as number;
        if (index === 0) return { kind: 'approve' } as const;
        if (index !== 1) return { kind: 'cancel' } as const;
        const note = ((await store.ask({ kind: 'text', label: '고칠 점' })) as string).trim();
        return note === '' ? ({ kind: 'cancel' } as const) : ({ kind: 'revise', note } as const);
      }),
    pickRepo: (candidates) =>
      asking('어느 저장소 일인지 골라 주세요', async () => {
        const index = (await store.ask({ kind: 'menu', screen: '? 어느 저장소 일인가요?', options: candidates.map((c) => c.name) })) as number;
        return index >= 0 && index < candidates.length ? candidates[index]!.name : null;
      }),
  };

  const prompts = await loadPrompts();

  /** 설계 서비스가 쓰는 사용자 쪽(위 user의 설계 대화 부분) */
  const designUser: DesignUserPort = { discuss: (q) => user.discuss!(q), approve: (plan) => user.approve!(plan) };

  // 작업 공간: 띄운 폴더가 저장소면 그것 하나, 저장소들을 담은 폴더면 그 아래 저장소들, 없으면 띄운 폴더 하나.
  const wsStore = new FileWorkspaceStore(join(home, '.rauha', 'workspaces'), workDir);
  const savedWs = await wsStore.load();
  const found = discoverRepos(workDir);
  const extra = (savedWs?.extra ?? []).filter((r) => isRepo(r));
  const roots = [...(found.length > 0 ? found : [workDir]), ...extra];
  const workspace = Workspace.of(roots, savedWs?.current ?? (roots.length === 1 ? roots[0]! : null));
  const multi = () => workspace.repos.length > 1;
  const saveWs = () => void wsStore.save({ extra, current: workspace.current()?.root ?? null }).catch(() => undefined);

  /** 저장소 하나에 딸린 것들. 저장소마다 그 저장소의 계정(프로필)으로 팀원·기억·지식을 따로 둔다. */
  interface Bundle {
    readonly profile: Profile;
    readonly chat: ChatSession;
    readonly team: ReturnType<typeof createTeam>;
    readonly memory: ReturnType<typeof openMemory>;
    readonly snapshots: FileChatSnapshots;
  }
  const bundles = new Map<string, Bundle>();
  // --continue: 저장소마다 저장해 둔 대화를 미리 읽는다(세션은 그 저장소를 처음 쓸 때 연다).
  const resumed = new Map<string, ChatSnapshot | null>();
  if (options.resume) {
    for (const repo of workspace.repos) resumed.set(repo.root, await new FileChatSnapshots(options.profileFor(repo.root).sessionsDir(home), projectRoot(repo.root)).load());
  }

  const open = (repo: WorkspaceRepo): RepoSession => {
    const repoProfile = options.profileFor(repo.root);
    const ctx = { root: repo.root, profile: repoProfile, home, ask, user, progress, requireClean: true, threePass: options.threePass };
    const team = createTeam(ctx, prompts);
    const knowledge = createKnowledge(ctx, team);
    const memory = openMemory(ctx);
    const deps = {
      knowledge,
      repoName: repo.name,
      // /repo add로 저장소가 늘 수 있어 부를 때마다 읽는다.
      get folder() {
        return multi() ? { root: workDir, repos: workspace.repos.map((r) => ({ name: r.name, root: r.root })) } : undefined;
      },
      designer: new DesignService({ team, roles: roleSettings(), user: designUser, store: new FileDesignStore(repoProfile.designsDir(home), repo.root), progress, today: () => new Date().toISOString().slice(0, 10) }),
      newLoop: (carried: ReadonlyMap<string, string>) => createLoop(ctx, prompts, team, carried, knowledge),
      team,
      workspace: new GitWorkspace(repo.root, loadSecretPolicy(repo.root)),
      memory,
      user,
      progress,
      roles: roleSettings(),
      now: Date.now,
      newId: () => crypto.randomUUID(),
      today: () => new Date().toISOString().slice(0, 10),
      nowText: () => `${new Date().toLocaleString('ko-KR', { dateStyle: 'full', timeStyle: 'short' })} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`,
    };
    const saved = resumed.get(repo.root) ?? null;
    const chat = saved !== null ? ChatSession.resume(deps, saved) : ChatSession.start(deps);
    bundles.set(repo.root, { profile: repoProfile, chat, team, memory, snapshots: new FileChatSnapshots(repoProfile.sessionsDir(home), projectRoot(repo.root)) });
    return { repo, profileName: repoProfile.name, chat, knowledge };
  };
  const ws = new WorkspaceSession({ workspace, open, user, onCurrent: () => saveWs() });
  /** 지금 저장소의 묶음(처음이면 연다). 지금 저장소가 없으면 null. */
  const current = (): Bundle | null => {
    const repo = ws.current();
    if (repo === null) return null;
    ws.session(repo);
    return bundles.get(repo.root) ?? null;
  };
  /** 입력 하나를 마칠 때마다 남겨 두어 --continue로 이어 연다. 저장 실패는 대화를 막지 않는다. */
  const remember = (bundle: Bundle | null | undefined) => {
    if (bundle) void bundle.snapshots.save(bundle.chat.snapshot(new Date().toISOString())).catch(() => undefined);
  };
  const bundleNamed = (name: string | null) => bundles.get(workspace.repos.find((r) => r.name === name)?.root ?? '') ?? null;
  // 지금 저장소가 있으면 미리 연다(라우터·답변 팀원을 미리 띄워 첫 질문이 빠르게).
  const first = current();
  /** 마지막 작업의 읽기 안내서. 결과 카드 대신 자세히 볼 때 /guide로 연다. */
  let lastGuide: string | null = null;
  /** /update로 갱신을 마쳐 화면을 닫은 뒤 다시 띄워야 하는지 */
  let restartAfterExit = false;

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

  if (multi()) store.print(`  작업 공간 저장소 ${workspace.repos.length}개: ${workspace.repos.map((r) => r.name).join(', ')} · /repo로 고를 수 있어요`);
  if (options.resume) {
    const s = first?.chat.status();
    const any = [...resumed.values()].some((v) => v !== null);
    store.print(any && s ? `  지난 대화를 이어요 · 대화 ${s.turns}번 · 마지막 작업: ${s.lastTitle ?? '없음'}` : '  이어 갈 대화가 없어서 새로 시작해요.');
  }

  // 로그인이 풀려 있으면 첫 요청에서 알기 전에 미리 알린다(풀린 채로 두면 요청이 엉뚱하게 처리된 적이 있다). 프로필마다 한 번, 모르면 조용히.
  for (const checked of new Set(workspace.repos.map((r) => options.profileFor(r.root)))) {
    void readLoginStatus({ ...definedEnv(process.env), ...checked.agentEnv(home) }).then((loggedIn) => {
      if (loggedIn === false) store.print(`  ⚠ ${checked.badge()} Claude에 로그인되어 있지 않아요. /exit로 나가서 ${checked.name === 'personal' ? 'rauha login' : `rauha login --profile ${checked.name}`}을 실행한 뒤 다시 와 주세요.`);
    });
  }

  // Ctrl+C: 일하는 중이면 그 작업만 멈춘다(팀원 호출을 끊고 기다리던 질문은 거절로 닫는다).
  // 쉬는 중이면 2초 안에 한 번 더 눌러야 끝난다.
  let lastInterrupt = 0;
  function interrupt(): void {
    if (store.busy) {
      for (const b of bundles.values()) b.team.cancel();
      store.cancelPrompts();
      store.print('  멈추는 중이에요…');
      return;
    }
    if (Date.now() - lastInterrupt < EXIT_WINDOW_MS) {
      // 알림을 지운 화면이 한 번 그려진 뒤 닫는다(바로 닫으면 마지막 화면에 알림이 남는다).
      store.setNotice('');
      setTimeout(() => app.unmount(), 50);
      return;
    }
    lastInterrupt = Date.now();
    // 지난 출력에 남기지 않고 입력창 아래에 잠깐 띄운다(Claude Code·Kiro처럼).
    store.setNotice('한 번 더 Ctrl+C(또는 Ctrl+D)를 누르면 끝나요');
    setTimeout(() => store.setNotice(''), EXIT_WINDOW_MS).unref();
  }

  async function handle(text: string): Promise<void> {
    const command = parseCommand(text);
    if (command !== null) {
      switch (command.kind) {
        case 'clear':
          for (const b of bundles.values()) {
            b.chat.clear();
            remember(b);
          }
          // 터미널의 clear처럼 화면과 스크롤까지 지우고 배너부터 새로 그린다.
          store.clearScreen();
          return;
        case 'status': {
          const b = current();
          if (b === null) return store.print(NO_CURRENT);
          const s = b.chat.status();
          store.print(`  ${multi() ? `[${ws.current()?.name}] ` : ''}대화 ${s.turns}번 · 이어 일할 파일 ${s.carriedFiles}개 · 마지막 작업: ${s.lastTitle ?? '없음'}`);
          return;
        }
        case 'usage':
          await usageTimer.now();
          store.printLines(usageLines(plan, totalUsage(), new Date(), undefined, view?.gauge));
          return;
        case 'update': {
          if (!isRauhaRepo()) {
            store.print('  rauha가 저장소에서 실행 중이 아니라 갱신할 수 없어요. 저장소에서 yarn rauha update를 실행해 주세요.');
            return;
          }
          store.setBusy(true);
          store.print('\n  새 버전이 있는지 확인해요…');
          const result = await runUpdate(repoRoot(), nodeExec(), (line) => store.print(line));
          store.setBusy(false);
          if (!result.ok || !result.built) return;
          // 방금 빌드한 코드로 뜨도록, 이 화면을 닫고 같은 터미널에서 새 프로세스로 다시 띄운다(지난 작업 기억은 파일에 있어 남는다).
          store.print('  다시 띄울게요.');
          restartAfterExit = true;
          app.unmount();
          return;
        }
        case 'guide':
          store.print(lastGuide !== null ? `\n${lastGuide}\n` : '  아직 끝난 작업이 없어요.');
          return;
        case 'repo':
          return repoCommand(command);
        case 'review': {
          const b = current();
          if (b === null) return store.print(NO_CURRENT);
          store.print(`\n> ${text}`);
          b.team.resume();
          store.setBusy(true);
          try {
            const turn = await b.chat.review(command.target);
            finishWorking();
            store.printLines(describeTurn(turn, view));
          } catch (error) {
            finishWorking();
            store.print(`rauha: ${(error as Error).message}`);
          } finally {
            store.setBusy(false);
            remember(b);
          }
          return;
        }
        case 'design': {
          if (command.request === null) return store.print('  /design <요청>으로 설계부터 시작해요. 예: /design 쿠폰 기능 만들어줘');
          return runTurn(text, command.request, 'design');
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
    return runTurn(text, text);
  }

  /** 입력 하나를 작업 공간에 보내고 결과를 화면에 낸다. shown: 화면에 "> " 뒤로 보일 글, force: /design처럼 라우터를 건너뛸 때 */
  async function runTurn(shown: string, request: string, force?: 'design'): Promise<void> {
    store.print(`\n> ${shown}`);
    for (const b of bundles.values()) b.team.resume();
    store.setBusy(true);
    let handled: string | null = null;
    try {
      const turn = await ws.handle(request, force);
      handled = turn.repo;
      if (turn.kind === 'work') lastGuide = turn.outcome.guide.toMarkdown();
      finishWorking();
      if (multi() && turn.repo !== null) store.print(`  [${turn.repo}]`);
      store.printLines(describeTurn(turn, view));
    } catch (error) {
      finishWorking();
      store.print(`rauha: ${(error as Error).message}`);
    } finally {
      store.setBusy(false);
      remember(bundleNamed(handled));
      void usageTimer.now();
    }
  }

  /** 열린 저장소 세션들의 호출 수를 더한다. */
  function totalUsage() {
    const calls = { haiku: 0, sonnet: 0, opus: 0 };
    let costUsd = 0;
    for (const b of bundles.values()) {
      const u = b.chat.usage();
      costUsd += u.costUsd;
      for (const tier of Object.keys(calls) as (keyof typeof calls)[]) calls[tier] += u.calls[tier];
    }
    return { calls, costUsd };
  }

  async function repoCommand(command: Extract<ChatCommand, { kind: 'repo' }>): Promise<void> {
    if (command.action === 'add') {
      const path = resolve(workDir, command.path);
      if (!isRepo(path)) return store.print(`  ${command.path}는 git 저장소가 아니에요.`);
      const repo = ws.add(path);
      const known = (list: readonly string[]) => list.some((e) => e.toLowerCase() === path.toLowerCase());
      if (!known(extra) && !known(found)) extra.push(path);
      saveWs();
      return store.print(`  작업 공간에 더했어요: ${repo.name}`);
    }
    if (command.action === 'select') {
      const repo = ws.select(command.name);
      if (repo === null) return store.print(`  ${command.name} 저장소가 작업 공간에 없어요. /repo로 목록을 볼 수 있어요.`);
      void usageTimer.now();
      return store.print(`  지금 저장소: ${repo.name}`);
    }
    const now = ws.current()?.root ?? null;
    const lines = await Promise.all(
      workspace.repos.map(async (r) => `  ${r.root === now ? '▸' : ' '} ${r.name}  ${(await currentBranch(r.root)) ?? '-'}  (${options.profileFor(r.root).name})`),
    );
    store.printLines(['', `  작업 공간 저장소 ${workspace.repos.length}개`, ...lines, '']);
  }

  // 상태 줄: 시작할 때, 입력 하나가 끝날 때, 그리고 입력이 없어도 1분마다 사용률을 새로 읽는다(모델을 부르지 않는다).
  // 세션 한도가 풀린 뒤에도 옛 퍼센트가 남아 있지 않게 하려고. 읽기에 실패하면 마지막으로 읽은 값을 그대로 둔다.
  let plan: PlanUsage | null = null;
  const usageTimer = startRefreshing(async () => {
    const repo = ws.current();
    const shown = repo === null ? profile : options.profileFor(repo.root);
    const agentEnv = { ...definedEnv(process.env), ...shown.agentEnv(home) };
    const [usage, branch] = await Promise.all([readPlanUsage(agentEnv), currentBranch(repo?.root ?? workDir)]);
    plan = usage ?? plan;
    store.setStatus(statusLine(shown.badge(), plan, branch, view?.gauge, multi() ? (repo?.name ?? null) : null));
  }, USAGE_REFRESH_MS);

  await app.waitUntilExit();
  screen.release();
  usageTimer.stop();
  for (const b of bundles.values()) {
    b.team.close();
    b.memory.close();
  }
  if (restartAfterExit) return relaunch(spawn, process.execPath, process.execArgv, process.argv[1]!, withContinue(process.argv.slice(2)));
  process.stderr.write('\n  대화를 마쳤어요. 이어서 하려면 rauha -c\n');
  return 0;
}
