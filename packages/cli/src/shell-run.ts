import { spawn, spawnSync } from 'node:child_process';

export interface ShellResult {
  /** 표준 출력과 오류 출력을 나온 순서대로 이은 글 */
  readonly output: string;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
}

const DEFAULT_MAX_CHARS = 8000;

/** 사용자가 직접 친 명령을 실행한다(모델을 거치지 않는다). 입력이 필요한 명령은 기다리지 않고 끝나도록 stdin을 닫는다. */
export function runShell(command: string, cwd: string, timeoutMs: number, maxChars = DEFAULT_MAX_CHARS): Promise<ShellResult> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
      done(null);
    }, timeoutMs);
    const collect = (chunk: Buffer) => {
      output += chunk.toString('utf8');
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    let finished = false;
    const done = (exitCode: number | null, extra = '') => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      const text = output + extra;
      resolve({ output: text.length > maxChars ? `…(앞부분은 줄였어요)\n${text.slice(-maxChars)}` : text, exitCode, timedOut });
    };
    child.on('error', (error) => done(null, `\n${error.message}`));
    child.on('close', (code) => done(code));
  });
}

/** shell로 띄운 명령은 손자 프로세스가 남기 쉬워서 Windows에서는 트리째 끝낸다. */
function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
  else process.kill(pid);
}
