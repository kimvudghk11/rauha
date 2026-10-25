import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  AgentSdkTeamMember,
  FileRunLog,
  GitWorkspace,
  MinimalLoopService,
  NodeChecks,
  projectMemoryFile,
  PromptLibrary,
  RoleSettingsDto,
  SqliteMemory,
  workMemoryFrom,
  type Profile,
  type ProgressPort,
  type RunOutcome,
  type UserPort,
} from '@rauha/core';
import type { Asker } from './ask.js';

export interface RunContext {
  /** 작업 폴더(대상 프로젝트). */
  readonly root: string;
  readonly profile: Profile;
  readonly home: string;
  readonly ask: Asker;
  /** 해석이 갈리는 지점을 사용자에게 확인받는다. */
  readonly user: UserPort;
  readonly progress: ProgressPort;
  /** 커밋하지 않은 변경이 있으면 시작하지 않는다. */
  readonly requireClean: boolean;
  /** 이번 실행에만 덧씌우는 RAUHA_ROLE_* 값(bench 비교용) */
  readonly roleEnv?: Readonly<Record<string, string>>;
  /** false면 리뷰·사실 점검 없이 검증 통과로 완료(--quick) */
  readonly threePass?: boolean;
}

export interface RunResult {
  readonly outcome: RunOutcome;
  readonly promptHash: string;
}

function definedEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => e[1] !== undefined));
}

/** 사용자 PC 시간대 기준 YYYY-MM-DD. */
function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 기억은 git 저장소 최상위마다 하나. 하위 폴더에서 실행해도 같은 프로젝트 기억을 쓴다. */
function projectRoot(dir: string): string {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || dir;
  } catch {
    return dir;
  }
}

/** 프로젝트 기억 저장소를 연다. 쓰고 나면 close 한다. */
export function openMemory(ctx: Pick<RunContext, 'root' | 'profile' | 'home'>): SqliteMemory {
  return SqliteMemory.open(projectMemoryFile(ctx.profile.memoryDir(ctx.home), projectRoot(ctx.root)));
}

/** 한 번 실행(-p)한 작업도 기억에 남긴다. 실패해도 실행 결과는 그대로 두고 한 줄로 알린다. */
export async function rememberRun(outcome: RunOutcome, request: string, ctx: Pick<RunContext, 'root' | 'profile' | 'home'>, log: (line: string) => void): Promise<void> {
  try {
    const memory = openMemory(ctx);
    try {
      await memory.save(workMemoryFrom(outcome, { id: randomUUID(), at: new Date().toISOString(), request, extendsWork: null }));
    } finally {
      memory.close();
    }
  } catch (error) {
    log(`기억에 남기지 못했습니다: ${(error as Error).message}`);
  }
}

/** 어댑터를 조립해서 최소 루프를 한 번 돌린다. */
export async function runOnce(request: string, ctx: RunContext): Promise<RunResult> {
  const prompts = await PromptLibrary.load(process.env['RAUHA_PROMPTS_DIR'] ?? PromptLibrary.defaultDir());
  const runId = randomUUID();
  const service = new MinimalLoopService({
    team: new AgentSdkTeamMember({
      cwd: ctx.root,
      env: { ...definedEnv(process.env), ...ctx.profile.agentEnv(ctx.home) },
      prompts,
      ask: ctx.ask,
    }),
    workspace: new GitWorkspace(ctx.root),
    checks: new NodeChecks(ctx.root),
    log: new FileRunLog(ctx.profile.runsDir(ctx.home), runId, new Date(), prompts.hash),
    progress: ctx.progress,
    user: ctx.user,
    roles: RoleSettingsDto.defaults().withEnv({ ...process.env, ...ctx.roleEnv }),
    newId: () => runId,
    now: () => Date.now(),
    today: () => localDate(new Date()),
    badge: ctx.profile.badge(),
    requireClean: ctx.requireClean,
    threePass: ctx.threePass ?? true,
  });
  return { outcome: await service.run(request), promptHash: prompts.hash };
}
