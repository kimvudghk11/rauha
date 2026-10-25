import { randomUUID } from 'node:crypto';
import {
  AgentSdkTeamMember,
  FileRunLog,
  GitWorkspace,
  MinimalLoopService,
  NodeChecks,
  PromptLibrary,
  RoleSettingsDto,
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
    roles: RoleSettingsDto.defaults().withEnv(process.env),
    newId: () => runId,
    now: () => Date.now(),
    today: () => localDate(new Date()),
    badge: ctx.profile.badge(),
    requireClean: ctx.requireClean,
  });
  return { outcome: await service.run(request), promptHash: prompts.hash };
}
