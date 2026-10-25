import { query, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { MODEL_ID } from '../domain/team.js';
import type { MemberCall, MemberResult, MemberUsage, TeamMemberPort } from '../application/ports.js';
import type { PromptLibrary } from './prompt-library.js';
import { createFetchLog } from './fetch-log.js';
import { createToolGuard, type PermissionAsker } from './tool-guard.js';
import { accountBlock } from './usage-limit.js';

export interface AgentSdkTeamMemberOptions {
  /** 작업 폴더. 팀원은 이 안에서만 일한다. */
  readonly cwd: string;
  /** process.env + 프로필의 CLAUDE_CONFIG_DIR. SDK의 env는 환경 전체를 바꾸므로 PATH까지 넘긴다. */
  readonly env: Record<string, string>;
  readonly prompts: PromptLibrary;
  readonly ask: PermissionAsker;
}

/**
 * 팀원 한 명 = Agent SDK query() 한 번. 역할 프롬프트는 짧은 자체 문자열로 넣어
 * (claude_code preset 대신) 앞부분을 고정하고 캐시가 잘 먹게 한다.
 */
export class AgentSdkTeamMember implements TeamMemberPort {
  /** 이번 실행 동안 사용자가 계속 허락한 동작. 이 객체는 실행 한 번에 하나라서 여기 둔다. */
  private readonly remembered = new Set<string>();

  constructor(private readonly options: AgentSdkTeamMemberOptions) {}

  async run(call: MemberCall): Promise<MemberResult> {
    const model = MODEL_ID[call.setting.tier];
    const started = Date.now();
    const stderr: string[] = [];
    const fetchLog = createFetchLog();
    let result: SDKResultMessage | null = null;
    try {
      const messages = query({
        prompt: call.userMessage,
        options: {
          model,
          cwd: this.options.cwd,
          env: this.options.env,
          systemPrompt: this.options.prompts.system(call.role),
          tools: [...call.setting.tools],
          allowedTools: [...call.setting.tools],
          permissionMode: 'dontAsk',
          settingSources: ['project'],
          effort: call.setting.effort,
          maxTurns: call.setting.maxTurns,
          maxBudgetUsd: call.setting.maxBudgetUsd,
          outputFormat: { type: 'json_schema', schema: call.outputSchema },
          hooks: {
            PreToolUse: [{ hooks: [createToolGuard({ root: this.options.cwd, role: call.role, canWrite: call.canWrite, ask: this.options.ask, remembered: this.remembered })] }],
            PostToolUse: [{ hooks: [fetchLog.hook] }],
          },
          stderr: (data) => {
            stderr.push(data);
            if (stderr.length > 50) stderr.shift();
          },
        },
      });
      for await (const message of messages) {
        if (message.type === 'result') result = message;
      }
    } catch (error) {
      const detail = stderr.join('').trim().split('\n').slice(-5).join('\n');
      const message = `${(error as Error).message}${detail ? `\n${detail}` : ''}`;
      return {
        output: null,
        error: message,
        usage: emptyUsage(model, Date.now() - started),
        fetched: fetchLog.entries(),
        blocked: accountBlock(message),
      };
    }

    const fetched = fetchLog.entries();
    if (result === null) return { output: null, error: '결과 메시지를 받지 못했습니다.', usage: emptyUsage(model, Date.now() - started), fetched };
    const usage = toUsage(model, result);
    if (result.subtype !== 'success') {
      const error = `${result.subtype}: ${result.errors.join(' / ')}`;
      return { output: null, error, usage, fetched, blocked: accountBlock(error) };
    }
    return { output: result.structured_output ?? null, error: result.structured_output === undefined ? '구조화 출력이 없습니다.' : null, usage, fetched };
  }
}

function emptyUsage(model: string, durationMs: number): MemberUsage {
  return { model, durationMs, costUsd: 0, turns: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, denials: [], endReason: 'error' };
}

function toUsage(model: string, result: SDKResultMessage): MemberUsage {
  const models = Object.values(result.modelUsage ?? {});
  return {
    model,
    durationMs: result.duration_ms,
    costUsd: result.total_cost_usd,
    turns: result.num_turns,
    inputTokens: models.reduce((n, m) => n + m.inputTokens + m.cacheCreationInputTokens, 0),
    outputTokens: models.reduce((n, m) => n + m.outputTokens, 0),
    cacheReadTokens: models.reduce((n, m) => n + m.cacheReadInputTokens, 0),
    denials: result.permission_denials.map((d) => `${d.tool_name}: ${JSON.stringify(d.tool_input).slice(0, 160)}`),
    endReason: result.terminal_reason ?? result.subtype,
  };
}
