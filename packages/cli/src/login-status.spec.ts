import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { parseLoginStatus, readLoginStatus } from './login-status.js';

describe('parseLoginStatus', () => {
  it('claude auth status의 JSON에서 로그인 여부를 읽는다', () => {
    expect(parseLoginStatus('{"loggedIn": false, "authMethod": "none"}')).toBe(false);
    expect(parseLoginStatus('{"loggedIn": true, "authMethod": "claude.ai"}')).toBe(true);
  });

  it('읽을 수 없는 출력은 모른다(null)고 한다', () => {
    expect(parseLoginStatus('')).toBeNull();
    expect(parseLoginStatus('not json')).toBeNull();
    expect(parseLoginStatus('{"loggedIn": "yes"}')).toBeNull();
  });
});

function fakeSpawn(stdout: string, behaviour: 'close' | 'error' | 'hang' = 'close') {
  const calls: unknown[][] = [];
  const spawn = (...args: unknown[]) => {
    calls.push(args);
    const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), kill: () => true });
    setImmediate(() => {
      if (behaviour === 'hang') return;
      if (behaviour === 'error') return child.emit('error', new Error('spawn claude ENOENT'));
      child.stdout.emit('data', Buffer.from(stdout));
      child.emit('close', 1);
    });
    return child;
  };
  return { calls, spawn: spawn as unknown as Parameters<typeof readLoginStatus>[1] };
}

describe('readLoginStatus', () => {
  it('프로필의 설정 폴더로 claude auth status를 불러 로그인 여부를 돌려준다', async () => {
    const { calls, spawn } = fakeSpawn('{"loggedIn": false}');
    expect(await readLoginStatus({ CLAUDE_CONFIG_DIR: 'C:/p/claude' }, spawn, 'linux')).toBe(false);
    expect(calls[0]!.slice(0, 2)).toEqual(['claude', ['auth', 'status']]);
    expect(calls[0]![2]).toMatchObject({ env: { CLAUDE_CONFIG_DIR: 'C:/p/claude' } });
  });

  it('Windows에서는 셸에 한 줄로 넘긴다', async () => {
    const { calls, spawn } = fakeSpawn('{"loggedIn": true}');
    expect(await readLoginStatus({}, spawn, 'win32')).toBe(true);
    expect(calls[0]![0]).toBe('claude auth status');
    expect(calls[0]![1]).toMatchObject({ shell: true });
  });

  it('claude를 못 띄우거나 오래 걸리면 모른다(null)고 한다 (시작을 막지 않는다)', async () => {
    expect(await readLoginStatus({}, fakeSpawn('', 'error').spawn, 'linux')).toBeNull();
    expect(await readLoginStatus({}, fakeSpawn('', 'hang').spawn, 'linux', 50)).toBeNull();
  });
});
