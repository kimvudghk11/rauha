import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNotifier, notifyAfter, notifyCommand, notifyWhile, type NotifyCommand } from './notify.js';

afterEach(() => vi.useRealTimers());

describe('notifyCommand', () => {
  it('Windows는 PowerShell 토스트 알림이고, 글은 스크립트가 아니라 환경 변수로 넘긴다 (글이 명령으로 해석되지 않게)', () => {
    const cmd = notifyCommand('win32', "rauha · 선택", "rm -rf '$HOME'; $(evil)")!;
    expect(cmd.command).toBe('powershell.exe');
    // 스크립트는 따옴표 해석에 기대지 않도록 Base64(UTF-16LE)로 넘긴다.
    expect(cmd.args).toEqual(expect.arrayContaining(['-NoProfile', '-NonInteractive', '-EncodedCommand']));
    expect(cmd.args.at(-2)).toBe('-EncodedCommand');
    const script = Buffer.from(cmd.args.at(-1)!, 'base64').toString('utf16le');
    expect(script).toContain('ToastNotificationManager');
    expect(script).toContain('RAUHA_NOTIFY_TITLE');
    expect(script).not.toContain('evil');
    expect(script).not.toContain('rm -rf');
    expect(cmd.env).toEqual({ RAUHA_NOTIFY_TITLE: 'rauha · 선택', RAUHA_NOTIFY_BODY: "rm -rf '$HOME'; $(evil)" });
  });

  it('Mac은 osascript이고, 글은 인자로 넘긴다', () => {
    const cmd = notifyCommand('darwin', '제목', '내용 "따옴표"')!;
    expect(cmd.command).toBe('osascript');
    expect(cmd.args.slice(-2)).toEqual(['제목', '내용 "따옴표"']);
    expect(cmd.args.join(' ')).toContain('display notification (item 2 of argv) with title (item 1 of argv)');
    expect(cmd.env).toEqual({});
  });

  it('Linux는 notify-send', () => {
    expect(notifyCommand('linux', '제목', '내용')).toEqual({ command: 'notify-send', args: ['제목', '내용'], env: {} });
  });

  it('지원하지 않는 플랫폼이면 null', () => {
    expect(notifyCommand('aix', '제목', '내용')).toBeNull();
  });

  it('긴 글은 자르고, 줄바꿈과 제어 문자는 공백으로 바꾼다', () => {
    const cmd = notifyCommand('linux', '제목\n둘째 줄', `${'가'.repeat(300)}\u0007\n끝`)!;
    expect(cmd.args[0]).toBe('제목 둘째 줄');
    expect(cmd.args[1]!.length).toBeLessThanOrEqual(200);
    expect(cmd.args[1]!.endsWith('…')).toBe(true);
    expect(cmd.args[1]).not.toMatch(/[\u0000-\u001f]/);
  });
});

describe('createNotifier', () => {
  function fakeSpawn() {
    const calls: { command: string; args: readonly string[]; options: Record<string, unknown> }[] = [];
    const child = { on: vi.fn(), unref: vi.fn() };
    const spawn = ((command: string, args: readonly string[], options: Record<string, unknown>) => {
      calls.push({ command, args, options });
      return child;
    }) as never;
    return { spawn, calls, child };
  }

  it('알림 프로그램을 화면 없이 띄우고 기다리지 않는다', () => {
    const { spawn, calls, child } = fakeSpawn();
    createNotifier(spawn, 'linux', { PATH: '/bin' }).notify('제목', '내용');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ command: 'notify-send', args: ['제목', '내용'], options: { stdio: 'ignore', windowsHide: true } });
    expect(child.unref).toHaveBeenCalled();
  });

  it('환경 변수는 기존 환경에 합쳐서 넘긴다', () => {
    const { spawn, calls } = fakeSpawn();
    createNotifier(spawn, 'win32', { PATH: 'C:\\bin' }).notify('제목', '내용');
    expect(calls[0]!.options['env']).toMatchObject({ PATH: 'C:\\bin', RAUHA_NOTIFY_TITLE: '제목', RAUHA_NOTIFY_BODY: '내용' });
  });

  it('프로그램이 없거나 실패해도 오류를 내지 않는다 (알림은 덤이라 작업을 막지 않는다)', () => {
    const throwing = (() => {
      throw new Error('ENOENT');
    }) as never;
    expect(() => createNotifier(throwing, 'linux', {}).notify('제목', '내용')).not.toThrow();

    const { spawn, child } = fakeSpawn();
    createNotifier(spawn, 'linux', {}).notify('제목', '내용');
    const onError = child.on.mock.calls.find(([event]) => event === 'error')?.[1] as (() => void) | undefined;
    expect(onError).toBeTypeOf('function');
    expect(() => onError?.()).not.toThrow();
  });

  it('지원하지 않는 플랫폼에서는 아무것도 띄우지 않는다', () => {
    const { spawn, calls } = fakeSpawn();
    createNotifier(spawn, 'aix', {}).notify('제목', '내용');
    expect(calls).toEqual([]);
  });
});

describe('notifyWhile', () => {
  it('질문이 끝나기 전에 시간이 지나면 알리고, 끝나면 그 뒤로는 알리지 않는다', async () => {
    vi.useFakeTimers();
    const notified: string[] = [];
    const notifier = { notify: (_title: string, body: string) => void notified.push(body) };
    let answer: (value: number) => void = () => {};
    const pending = notifyWhile(notifier, 4000, '제목', '내용', () => new Promise<number>((resolve) => (answer = resolve)));
    await vi.advanceTimersByTimeAsync(4000);
    expect(notified).toEqual(['내용']);
    answer(1);
    expect(await pending).toBe(1);
  });

  it('제때 답하면 알리지 않고 답을 그대로 돌려준다', async () => {
    vi.useFakeTimers();
    const notified: string[] = [];
    const notifier = { notify: (_title: string, body: string) => void notified.push(body) };
    const result = await notifyWhile(notifier, 4000, '제목', '내용', async () => 'ok');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(result).toBe('ok');
    expect(notified).toEqual([]);
  });

  it('질문이 실패해도 예약한 알림을 지우고 오류를 그대로 던진다', async () => {
    vi.useFakeTimers();
    const notified: string[] = [];
    const notifier = { notify: (_title: string, body: string) => void notified.push(body) };
    await expect(
      notifyWhile(notifier, 4000, '제목', '내용', async () => {
        throw new Error('닫힘');
      }),
    ).rejects.toThrow('닫힘');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(notified).toEqual([]);
  });

  it('알림 도구가 없으면 질문만 그대로 한다', async () => {
    expect(await notifyWhile(null, 4000, '제목', '내용', async () => 3)).toBe(3);
  });
});

describe('notifyAfter', () => {
  const recorder = () => {
    const sent: NotifyCommand[] = [];
    return { sent, notifier: { notify: (title: string, body: string) => void sent.push({ command: title, args: [body], env: {} }) } };
  };

  it('질문이 한동안 답해지지 않으면 알린다', () => {
    vi.useFakeTimers();
    const { sent, notifier } = recorder();
    notifyAfter(notifier, 4000, '제목', '내용');
    vi.advanceTimersByTime(3999);
    expect(sent).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(sent).toHaveLength(1);
  });

  it('그 안에 답하면(취소하면) 알리지 않는다 (이미 화면을 보고 있는 사람에게 알림을 띄우지 않으려고)', () => {
    vi.useFakeTimers();
    const { sent, notifier } = recorder();
    const cancel = notifyAfter(notifier, 4000, '제목', '내용');
    vi.advanceTimersByTime(2000);
    cancel();
    vi.advanceTimersByTime(10_000);
    expect(sent).toHaveLength(0);
    expect(() => cancel()).not.toThrow();
  });
});
