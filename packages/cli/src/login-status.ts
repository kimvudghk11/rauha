import { spawn as nodeSpawn } from 'node:child_process';

/** `claude auth status`가 JSON으로 내는 loggedIn. 읽을 수 없으면 null. */
export function parseLoginStatus(stdout: string): boolean | null {
  try {
    const value = (JSON.parse(stdout) as { loggedIn?: unknown }).loggedIn;
    return typeof value === 'boolean' ? value : null;
  } catch {
    return null;
  }
}

/**
 * 이 환경(프로필의 CLAUDE_CONFIG_DIR)이 Claude에 로그인돼 있는지. 모델을 부르지 않고 설정만 읽어서 빠르다.
 * claude를 못 띄우거나 시간이 걸리면 null(모름) — 시작을 막지 않는다.
 * Windows의 claude는 .cmd라 셸에 한 줄로 넘긴다(인자 배열이면 Node 24가 DEP0190 경고를 띄운다).
 */
export function readLoginStatus(env: NodeJS.ProcessEnv, spawn: typeof nodeSpawn = nodeSpawn, platform: string = process.platform, timeoutMs = 10_000): Promise<boolean | null> {
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    const finish = (value: boolean | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    const options = { env, windowsHide: true } as const;
    let child: ReturnType<typeof nodeSpawn>;
    try {
      child = platform === 'win32' ? spawn('claude auth status', { ...options, shell: true }) : spawn('claude', ['auth', 'status'], options);
    } catch {
      return resolve(null);
    }
    const timer = setTimeout(() => {
      child.kill();
      finish(null);
    }, timeoutMs);
    child.stdout?.on('data', (d: Buffer) => (out += d.toString()));
    child.on('error', () => finish(null));
    child.on('close', () => finish(parseLoginStatus(out)));
  });
}
