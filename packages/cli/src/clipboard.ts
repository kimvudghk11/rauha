import { spawn as nodeSpawn } from 'node:child_process';

export interface CopyCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  /** 표준 입력으로 넘길 글. null이면 환경 변수로 넘긴다. */
  readonly input: string | null;
}

/** Windows는 clip이 한글을 깨뜨려서 PowerShell로 한다. 글은 스크립트에 끼우지 않고 환경 변수로만 넘긴다. */
const WINDOWS_SCRIPT = "$ErrorActionPreference = 'Stop'; Set-Clipboard -Value $env:RAUHA_COPY_TEXT";

/** 플랫폼별 클립보드 복사 방법. 지원하지 않으면 null. */
export function copyCommand(platform: string, text: string): CopyCommand | null {
  switch (platform) {
    case 'win32':
      return {
        command: 'powershell.exe',
        args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(WINDOWS_SCRIPT, 'utf16le').toString('base64')],
        env: { RAUHA_COPY_TEXT: text },
        input: null,
      };
    case 'darwin':
      return { command: 'pbcopy', args: [], env: { LC_ALL: 'en_US.UTF-8' }, input: text };
    case 'linux':
      return { command: 'xclip', args: ['-selection', 'clipboard'], env: {}, input: text };
    default:
      return null;
  }
}

type Spawn = typeof nodeSpawn;

/** 글을 클립보드에 복사한다. 성공하면 true. 프로그램이 없거나 실패하면 false(대화를 막지 않는다). */
export function copyToClipboard(text: string, spawn: Spawn = nodeSpawn, platform: string = process.platform): Promise<boolean> {
  const cmd = copyCommand(platform, text);
  if (cmd === null) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd.command, [...cmd.args], { env: { ...process.env, ...cmd.env }, stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
      child.stdin?.end(cmd.input ?? undefined);
    } catch {
      resolve(false);
    }
  });
}
