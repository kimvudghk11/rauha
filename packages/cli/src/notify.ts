import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';

/** 알림 한 번을 띄우는 외부 프로그램 실행 방법. 글은 스크립트에 끼워 넣지 않고 인자나 환경 변수로만 넘긴다. */
export interface NotifyCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export interface Notifier {
  notify(title: string, body: string): void;
}

const MAX_BODY = 200;

/** 한 줄로 만들고(줄바꿈·제어 문자 → 공백) 너무 길면 자른다. 명령 내용처럼 길거나 엉뚱한 글이 올 수 있다. */
function clean(text: string, max: number): string {
  const flat = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Windows 토스트 알림. PowerShell 5.1이 기본으로 있고, 알림을 띄우는 앱 ID로 PowerShell 자신의 것을 쓰면
 * 따로 등록하지 않아도 뜬다. 제목과 내용은 환경 변수로 받아 XML로 이스케이프한다.
 */
const WINDOWS_TOAST_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
  '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null',
  '$title = [System.Security.SecurityElement]::Escape($env:RAUHA_NOTIFY_TITLE)',
  '$body = [System.Security.SecurityElement]::Escape($env:RAUHA_NOTIFY_BODY)',
  '$xml = New-Object Windows.Data.Xml.Dom.XmlDocument',
  `$xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text>$title</text><text>$body</text></binding></visual></toast>")`,
  '$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)',
  "$appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'",
  '[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)',
].join('; ');

/** 플랫폼별 알림 실행 방법. 지원하지 않으면 null. */
export function notifyCommand(platform: string, title: string, body: string): NotifyCommand | null {
  const t = clean(title, 80);
  const b = clean(body, MAX_BODY);
  switch (platform) {
    case 'win32':
      return {
        command: 'powershell.exe',
        // -Command로 넘기면 Windows 명령줄 해석에서 스크립트의 큰따옴표가 사라져 구문 오류가 난다. Base64로 넘긴다.
        args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(WINDOWS_TOAST_SCRIPT, 'utf16le').toString('base64')],
        env: { RAUHA_NOTIFY_TITLE: t, RAUHA_NOTIFY_BODY: b },
      };
    case 'darwin':
      return {
        command: 'osascript',
        args: ['-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title (item 1 of argv)', '-e', 'end run', t, b],
        env: {},
      };
    case 'linux':
      return { command: 'notify-send', args: [t, b], env: {} };
    default:
      return null;
  }
}

type Spawn = (command: string, args: readonly string[], options: SpawnOptions) => { on(event: 'error', listener: () => void): unknown; unref(): void };

/**
 * 운영체제 알림을 띄우는 곳. 알림은 덤이라서, 프로그램이 없거나 실패해도 작업을 막지 않고 조용히 넘어간다.
 * 띄운 프로그램은 기다리지 않는다.
 */
export function createNotifier(
  spawn: Spawn = nodeSpawn as unknown as Spawn,
  platform: string = process.platform,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Notifier {
  return {
    notify(title, body) {
      const cmd = notifyCommand(platform, title, body);
      if (cmd === null) return;
      try {
        const child = spawn(cmd.command, cmd.args, { env: { ...env, ...cmd.env }, stdio: 'ignore', windowsHide: true });
        child.on('error', () => {});
        child.unref();
      } catch {
        // 알림 프로그램을 못 띄워도 작업은 계속한다.
      }
    },
  };
}

/**
 * 질문이 delayMs 안에 답해지지 않으면 알림을 띄우도록 예약하고, 취소하는 함수를 돌려준다.
 * 사용자가 이미 화면을 보고 바로 답하면 알림이 뜨지 않게 하려고, 질문이 뜰 때 바로 알리지 않는다.
 */
export function notifyAfter(notifier: Notifier, delayMs: number, title: string, body: string): () => void {
  const timer = setTimeout(() => notifier.notify(title, body), delayMs);
  timer.unref?.();
  return () => clearTimeout(timer);
}

/** 질문을 하는 동안만 알림을 예약해 둔다. 질문이 끝나면(답하든 닫히든 실패하든) 예약을 지운다. notifier가 없으면 질문만 한다. */
export async function notifyWhile<T>(notifier: Notifier | null, delayMs: number, title: string, body: string, task: () => Promise<T>): Promise<T> {
  const cancel = notifier === null ? () => {} : notifyAfter(notifier, delayMs, title, body);
  try {
    return await task();
  } finally {
    cancel();
  }
}

/** 사용자가 바로 답하지 않을 때만 알린다. 이 시간 안에 답하면 알림은 뜨지 않는다. */
export const NOTIFY_AFTER_MS = 4000;

/** 이 시간 넘게 걸린 일이 끝나면 알린다. 그보다 짧은 일은 사용자가 화면을 보고 있었을 테니 알리지 않는다. */
export const LONG_WORK_MS = 20_000;

/** 일이 startedAt에 시작해 now에 끝났고 minMs 이상 걸렸다면 알린다. */
export function notifyIfLong(notifier: Notifier | null, startedAt: number, now: number, minMs: number, title: string, body: string): void {
  if (notifier !== null && now - startedAt >= minMs) notifier.notify(title, body);
}
