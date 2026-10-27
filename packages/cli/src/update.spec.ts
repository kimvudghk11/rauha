import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { isRauhaRepo, nodeExec, relaunch, runUpdate, withContinue, type Exec } from './update.js';

describe('withContinue', () => {
  it('/update 뒤 다시 띄울 때 지난 대화를 이어 가도록 --continue를 더한다(이미 있으면 그대로)', () => {
    expect(withContinue([])).toEqual(['--continue']);
    expect(withContinue(['-c'])).toEqual(['-c']);
    expect(withContinue(['--profile', 'work'])).toEqual(['--profile', 'work', '--continue']);
  });
});

describe('nodeExec', () => {
  function fakeSpawn() {
    const calls: unknown[][] = [];
    const spawn = (...args: unknown[]) => {
      calls.push(args);
      const child = new EventEmitter();
      setImmediate(() => child.emit('close', 0));
      return child;
    };
    return { calls, spawn: spawn as unknown as Parameters<typeof nodeExec>[0] };
  }

  it('Windows에서는 셸에 명령 한 줄로 넘긴다(인자 배열 + shell은 Node 24에서 보안 경고가 뜬다)', async () => {
    const { calls, spawn } = fakeSpawn();
    await nodeExec(spawn, 'win32')('yarn', ['build'], '/repo');
    expect(calls[0]![0]).toBe('yarn build');
    expect(calls[0]![1]).toMatchObject({ shell: true, cwd: '/repo' });
  });

  it('다른 OS에서는 셸 없이 명령과 인자를 따로 넘긴다', async () => {
    const { calls, spawn } = fakeSpawn();
    await nodeExec(spawn, 'linux')('git', ['fetch', '--quiet'], '/repo');
    expect(calls[0]!.slice(0, 2)).toEqual(['git', ['fetch', '--quiet']]);
    expect(calls[0]![2]).not.toHaveProperty('shell', true);
  });
});

interface Reply {
  code?: number;
  stdout?: string;
  stderr?: string;
}

/** 명령 문장("git fetch --quiet")에 맞는 답을 돌려주는 가짜 실행기. 모르는 명령은 성공(빈 출력). */
function fakeExec(replies: Record<string, Reply | Reply[]>) {
  const calls: string[] = [];
  const exec: Exec = async (command, args) => {
    const key = [command, ...args].join(' ');
    calls.push(key);
    const reply = replies[key];
    const next = Array.isArray(reply) ? (reply.shift() ?? {}) : (reply ?? {});
    return { code: next.code ?? 0, stdout: next.stdout ?? '', stderr: next.stderr ?? '' };
  };
  return { exec, calls };
}

/** 테스트마다 새로 만든다: 답 목록은 호출할 때마다 하나씩 소모되어서 공유하면 다른 테스트에 번진다. */
const base = (): Record<string, Reply | Reply[]> => ({
  'git rev-parse --is-inside-work-tree': { stdout: 'true\n' },
  'git status --porcelain --untracked-files=no': { stdout: '' },
  'git rev-parse HEAD': [{ stdout: 'aaa\n' }, { stdout: 'bbb\n' }],
});

describe('runUpdate', () => {
  it('새 커밋이 있고 바뀐 파일이 없으면 내려받고 빌드한다', async () => {
    const { exec, calls } = fakeExec({ ...base(), 'git rev-parse HEAD': [{ stdout: 'aaa\n' }, { stdout: 'bbb\n' }], 'git rev-list --count HEAD..@{u}': { stdout: '3\n' }, 'git diff --name-only aaa bbb': { stdout: 'packages/cli/src/a.ts\n' } });
    const log: string[] = [];
    const result = await runUpdate('E:/rauha', exec, (l) => log.push(l));
    expect(result).toMatchObject({ ok: true, pulled: 3, installed: false, built: true });
    expect(calls).toEqual(expect.arrayContaining(['git fetch --quiet', 'git pull --ff-only', 'yarn build']));
    expect(calls).not.toContain('yarn install');
    expect(log.join('\n')).toContain('새 커밋 3개');
  });

  it('package.json이나 yarn.lock이 바뀌었으면 설치한 뒤 빌드한다', async () => {
    const { exec, calls } = fakeExec({ ...base(), 'git rev-parse HEAD': [{ stdout: 'aaa\n' }, { stdout: 'bbb\n' }], 'git rev-list --count HEAD..@{u}': { stdout: '1\n' }, 'git diff --name-only aaa bbb': { stdout: 'yarn.lock\npackages/cli/src/a.ts\n' } });
    const result = await runUpdate('E:/rauha', exec, () => {});
    expect(result).toMatchObject({ ok: true, installed: true, built: true });
    expect(calls.indexOf('yarn install')).toBeGreaterThan(calls.indexOf('git pull --ff-only'));
    expect(calls.indexOf('yarn build')).toBeGreaterThan(calls.indexOf('yarn install'));
  });

  it('이미 최신이면 빌드도 다시 띄우기도 하지 않는다', async () => {
    const { exec, calls } = fakeExec({ ...base(), 'git rev-list --count HEAD..@{u}': { stdout: '0\n' } });
    const log: string[] = [];
    const result = await runUpdate('E:/rauha', exec, (l) => log.push(l));
    expect(result).toMatchObject({ ok: true, pulled: 0, built: false });
    expect(calls).not.toContain('git pull --ff-only');
    expect(calls).not.toContain('yarn build');
    expect(log.join('\n')).toContain('이미 최신');
  });

  it('바뀐 파일이 있어 내려받지 못하면 알리기만 한다 (작업 중인 파일을 건드리지 않는다)', async () => {
    const { exec, calls } = fakeExec({ ...base(), 'git status --porcelain --untracked-files=no': { stdout: ' M packages/cli/src/a.ts\n' }, 'git rev-list --count HEAD..@{u}': { stdout: '2\n' } });
    const log: string[] = [];
    const result = await runUpdate('E:/rauha', exec, (l) => log.push(l));
    expect(result).toMatchObject({ ok: true, pulled: 0, built: false });
    expect(calls).not.toContain('git pull --ff-only');
    expect(calls).not.toContain('yarn build');
    expect(log.join('\n')).toContain('바뀐 파일이 있어');
  });

  it('GitHub에 연결하지 못하면 알리기만 한다', async () => {
    const { exec, calls } = fakeExec({ ...base(), 'git fetch --quiet': { code: 128, stderr: 'unable to access' } });
    const log: string[] = [];
    const result = await runUpdate('E:/rauha', exec, (l) => log.push(l));
    expect(result).toMatchObject({ ok: true, built: false });
    expect(calls).not.toContain('yarn build');
    expect(log.join('\n')).toContain('연결하지 못');
  });

  it('git 저장소가 아니면 아무것도 하지 않는다', async () => {
    const { exec, calls } = fakeExec({ 'git rev-parse --is-inside-work-tree': { code: 128, stderr: 'not a git repository' } });
    const result = await runUpdate('E:/rauha', exec, () => {});
    expect(result).toMatchObject({ ok: true, pulled: 0, built: false });
    expect(calls).toEqual(['git rev-parse --is-inside-work-tree']);
  });

  it('빌드가 실패하면 실패로 끝내고 오류의 마지막 줄을 보여 준다 (그 상태로 다시 띄우지 않게)', async () => {
    const { exec } = fakeExec({ ...base(), 'git rev-list --count HEAD..@{u}': { stdout: '1\n' }, 'git diff --name-only aaa bbb': { stdout: 'a.ts\n' }, 'yarn build': { code: 2, stdout: 'a\nb\nerror TS2322: 형식이 맞지 않습니다\n' } });
    const log: string[] = [];
    const result = await runUpdate('E:/rauha', exec, (l) => log.push(l));
    expect(result).toMatchObject({ ok: false, built: false });
    expect(log.join('\n')).toContain('TS2322');
    expect(log.join('\n')).toContain('빌드에 실패');
  });

  it('설치가 실패하면 빌드하지 않고 실패로 끝낸다', async () => {
    const { exec, calls } = fakeExec({ ...base(), 'git rev-parse HEAD': [{ stdout: 'aaa\n' }, { stdout: 'bbb\n' }], 'git rev-list --count HEAD..@{u}': { stdout: '1\n' }, 'git diff --name-only aaa bbb': { stdout: 'package.json\n' }, 'yarn install': { code: 1, stderr: '네트워크 오류' } });
    const result = await runUpdate('E:/rauha', exec, () => {});
    expect(result.ok).toBe(false);
    expect(calls).not.toContain('yarn build');
  });
});

describe('isRauhaRepo', () => {
  it('루트 package.json의 이름이 rauha-monorepo일 때만 갱신 대상이다', () => {
    expect(isRauhaRepo(() => JSON.stringify({ name: 'rauha-monorepo' }))).toBe(true);
    expect(isRauhaRepo(() => JSON.stringify({ name: 'other' }))).toBe(false);
    expect(isRauhaRepo(() => 'not json')).toBe(false);
    expect(
      isRauhaRepo(() => {
        throw new Error('ENOENT');
      }),
    ).toBe(false);
  });
});

describe('relaunch', () => {
  it('같은 node와 같은 실행 파일·인자로 터미널을 이어받아 다시 띄우고, 끝난 종료 코드를 돌려준다', async () => {
    const calls: { command: string; args: readonly string[]; options: Record<string, unknown> }[] = [];
    const spawn = ((command: string, args: readonly string[], options: Record<string, unknown>) => {
      calls.push({ command, args, options });
      return { on: (event: string, cb: (code: number | null) => void) => (event === 'exit' ? setTimeout(() => cb(3), 0) : undefined) };
    }) as never;
    const code = await relaunch(spawn, 'C:/node.exe', ['--no-warnings'], 'E:/rauha/packages/cli/dist/main.js', ['--profile', 'work']);
    expect(code).toBe(3);
    expect(calls[0]).toMatchObject({ command: 'C:/node.exe', args: ['--no-warnings', 'E:/rauha/packages/cli/dist/main.js', '--profile', 'work'], options: { stdio: 'inherit' } });
  });

  it('다시 띄우지 못하면 오류를 던지지 않고 1을 돌려준다', async () => {
    const spawn = (() => {
      throw new Error('ENOENT');
    }) as never;
    expect(await relaunch(spawn, 'node', [], 'main.js', [])).toBe(1);
    vi.useRealTimers();
  });
});
