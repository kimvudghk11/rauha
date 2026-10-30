import { describe, expect, it } from 'vitest';
import { copyCommand, copyToClipboard } from './clipboard.js';

describe('copyCommand', () => {
  it('Windows는 PowerShell Set-Clipboard에 환경 변수로 글을 넘긴다 (한글이 깨지지 않게)', () => {
    const cmd = copyCommand('win32', '안녕\n세상')!;
    expect(cmd.command).toBe('powershell.exe');
    expect(cmd.env).toEqual({ RAUHA_COPY_TEXT: '안녕\n세상' });
    expect(cmd.input).toBeNull();
  });

  it('macOS는 pbcopy, Linux는 xclip의 표준 입력으로 넘긴다', () => {
    expect(copyCommand('darwin', '글')).toMatchObject({ command: 'pbcopy', input: '글' });
    expect(copyCommand('linux', '글')).toMatchObject({ command: 'xclip', args: ['-selection', 'clipboard'], input: '글' });
  });

  it('지원하지 않는 플랫폼은 null', () => {
    expect(copyCommand('aix', '글')).toBeNull();
  });
});

describe('copyToClipboard', () => {
  function fakeSpawn(exitCode: number, written: string[] = []) {
    return (() => {
      const listeners: Record<string, (arg: never) => void> = {};
      const child = {
        stdin: { end: (text?: string) => void written.push(text ?? '') },
        on: (event: string, listener: (arg: never) => void) => {
          listeners[event] = listener;
          if (event === 'close') queueMicrotask(() => listener(exitCode as never));
          return child;
        },
      };
      return child;
    }) as never;
  }

  it('복사에 성공하면 true, 표준 입력으로 글을 넘긴다', async () => {
    const written: string[] = [];
    expect(await copyToClipboard('내용', fakeSpawn(0, written), 'darwin')).toBe(true);
    expect(written).toEqual(['내용']);
  });

  it('프로그램이 실패하거나 플랫폼을 모르면 false', async () => {
    expect(await copyToClipboard('내용', fakeSpawn(1), 'darwin')).toBe(false);
    expect(await copyToClipboard('내용', fakeSpawn(0), 'aix')).toBe(false);
  });
});
