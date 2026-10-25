import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';
import type { FetchedPage } from '../application/ports.js';

/** 근거 확인에 충분한 만큼만 본문을 남긴다. */
const MAX_BODY = 20_000;

function bodyOf(response: unknown): string | null {
  if (typeof response === 'string') return response;
  if (typeof response === 'object' && response !== null) {
    const record = response as Record<string, unknown>;
    for (const key of ['result', 'content']) {
      if (typeof record[key] === 'string') return record[key] as string;
    }
  }
  return null;
}

/**
 * 팀원이 WebFetch로 실제로 연 주소와 본문을 남기는 PostToolUse 훅.
 * "찾아봤다"는 말 대신 이 기록으로 web 근거를 확인한다.
 */
export function createFetchLog(): { hook: HookCallback; entries(): FetchedPage[] } {
  const pages: FetchedPage[] = [];
  return {
    hook: async (input) => {
      if (input.hook_event_name !== 'PostToolUse' || input.tool_name !== 'WebFetch') return {};
      const url = (input.tool_input as Record<string, unknown> | undefined)?.['url'];
      if (typeof url !== 'string') return {};
      const body = bodyOf(input.tool_response);
      pages.push({ url, body: body === null ? null : body.slice(0, MAX_BODY) });
      return {};
    },
    entries: () => [...pages],
  };
}
