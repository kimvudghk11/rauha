import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';
import { relativeToRoot } from '../../shared/path-pattern.js';
import type { MemberRole } from '../application/dto/role-settings.dto.js';
import { ToolRisk } from '../domain/tool-risk.js';

const WRITE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit']);

/** 사용자에게 허락을 구하는 위험 동작 하나. */
export interface PermissionRequest {
  readonly role: MemberRole;
  readonly tool: string;
  /** 명령 문자열이나 파일 경로 */
  readonly detail: string;
  /** 왜 위험한지 */
  readonly reason: string;
}

/** allow-always: 이번 실행 동안 같은 도구·같은 명령은 다시 묻지 않는다. note: 거절하며 팀원에게 전할 말. */
export type PermissionAnswer = { readonly kind: 'allow' } | { readonly kind: 'allow-always' } | { readonly kind: 'deny'; readonly note: string | null };

/** 물을 화면이 없으면 { kind: 'deny', note: null }을 돌려준다. */
export type PermissionAsker = (request: PermissionRequest) => Promise<PermissionAnswer>;

export interface ToolGuardOptions {
  readonly root: string;
  readonly role: MemberRole;
  /** 작업 폴더 기준 상대 경로를 이 역할이 쓸 수 있는지(WritePolicy). */
  readonly canWrite: (relPath: string) => boolean;
  readonly ask: PermissionAsker;
  /** 이번 실행 동안 계속 허락한 '도구 + 명령'. 팀원 호출마다 가드가 새로 만들어지므로 밖에서 하나를 넘겨 공유한다. */
  readonly remembered: Set<string>;
}

function decide(permissionDecision: 'allow' | 'deny', reason: string) {
  return {
    hookSpecificOutput: { hookEventName: 'PreToolUse' as const, permissionDecision, permissionDecisionReason: reason },
  };
}

/**
 * 팀원의 모든 도구 호출 앞에서 도는 PreToolUse 훅.
 * 1) 역할 권한(잠긴 테스트, 범위 밖)은 묻지 않고 거절한다 — 판정의 공정성 문제라서.
 * 2) 위험 동작은 사용자에게 묻고, git commit·push는 언제나 거절한다.
 * 3) 나머지는 결정을 내리지 않고 SDK의 기본 흐름(allowedTools)에 맡긴다.
 */
export function createToolGuard(options: ToolGuardOptions): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== 'PreToolUse') return {};
    const toolInput = (input.tool_input ?? {}) as Record<string, unknown>;

    if (WRITE_TOOLS.has(input.tool_name)) {
      const path = toolInput['file_path'] ?? toolInput['notebook_path'];
      const rel = typeof path === 'string' ? relativeToRoot(options.root, path) : null;
      if (rel !== null && !options.canWrite(rel)) {
        return decide('deny', `이 역할은 ${rel}을(를) 쓸 수 없습니다(잠긴 테스트이거나 업무 범위 밖). 범위 안의 다른 파일로 해결하세요.`);
      }
    }

    const verdict = ToolRisk.assess(input.tool_name, toolInput, options.root);
    if (verdict.decision === 'deny') return decide('deny', verdict.reason ?? '거절된 동작입니다.');
    if (verdict.decision === 'ask') {
      const detail = typeof toolInput['command'] === 'string' ? toolInput['command'] : String(toolInput['file_path'] ?? input.tool_name);
      const key = `${input.tool_name}\n${detail}`;
      if (options.remembered.has(key)) return decide('allow', '사용자가 이번 실행 동안 허락한 동작입니다.');
      const reason = verdict.reason ?? '위험할 수 있는 동작입니다.';
      const answer = await options.ask({ role: options.role, tool: input.tool_name, detail, reason });
      if (answer.kind === 'allow-always') options.remembered.add(key);
      if (answer.kind !== 'deny') return decide('allow', '사용자가 허락했습니다.');
      const note = answer.note === null ? '' : ` 사용자가 남긴 말: "${answer.note}"`;
      return decide('deny', `사용자가 허락하지 않았습니다: ${reason}.${note} 더 안전한 방법을 쓰세요.`);
    }
    return {};
  };
}
