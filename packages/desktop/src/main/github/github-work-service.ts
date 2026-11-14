import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { architectureOf, stackFromPaths } from '../../shared/architecture.js';
import { terminalLine } from '../../shared/external-ai.js';
import { commitsFromApi, ghLoginsOf, langsByShare, reposFromApi, ssoHint, type RemoteRepo } from '../../shared/github-work.js';
import type { RepoStack, WorkCommit } from '../../shared/my-work.js';
import { isManifestPath, stackOf } from '../../shared/tech-stack.js';

/** GitHub 에서 읽은 내 작업(저장해 두고 다시 쓴다) */
export interface RemoteWork {
  /** ISO 시각 */
  readonly at: string;
  readonly logins: readonly string[];
  readonly repos: number;
  readonly commits: readonly WorkCommit[];
  readonly stacks: readonly RepoStack[];
  /** 막힌 레포·조직 안내(SSO 등) */
  readonly notes: readonly string[];
}

export interface GithubWorkDeps {
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.ProcessEnv;
  readonly cacheFile: string;
  readonly fetch?: typeof fetch;
  /** 확인용: gh 위치와 실행을 바꿔 끼운다 */
  readonly ghPath?: string;
  readonly run?: (file: string, args: readonly string[]) => Promise<{ code: number; out: string }>;
}

type Result<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: string };

const API = 'https://api.github.com';
const REPOS_PER_LOGIN = 60;
const COMMIT_PAGES = 2;
const MANIFESTS_PER_REPO = 15;
const MANIFEST_MAX_BYTES = 256 * 1024;
const CACHE_MS = 24 * 60 * 60 * 1000;
const CONCURRENCY = 4;

function run(file: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<{ code: number; out: string }> {
  return new Promise((done) => {
    execFile(file, [...args], { timeout: 15_000, windowsHide: true, env, encoding: 'utf8' }, (err, stdout, stderr) => {
      const code = err === null ? 0 : typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : -1;
      done({ code, out: `${String(stdout ?? '')}\n${String(stderr ?? '')}` });
    });
  });
}

/**
 * clone 없이 GitHub 에서 내 작업 읽기: gh CLI 에 로그인한 여러 계정(개인·회사)의 토큰으로 API 를 읽는다.
 * 읽는 것: 레포 목록, 레포마다 내가 쓴 커밋(제목·시각), 언어 비중, 파일 트리(아키텍처 신호), 얕은 설정 파일 몇 개(스택 이름).
 * 토큰은 이 서비스 안에서만 쓰고 저장·화면 전달하지 않는다.
 */
export class GithubWorkService {
  private constructor(private readonly deps: GithubWorkDeps) {}

  static create(deps: GithubWorkDeps): GithubWorkService {
    return new GithubWorkService(deps);
  }

  private gh(): string | null {
    if (this.deps.ghPath !== undefined) return this.deps.ghPath;
    const { env, platform } = this.deps;
    const names = platform === 'win32' ? ['gh.exe'] : ['gh'];
    for (const dir of (env['PATH'] ?? env['Path'] ?? '').split(delimiter)) for (const n of names) if (dir !== '' && existsSync(join(dir, n))) return join(dir, n);
    const extra = platform === 'win32' ? [join(env['ProgramFiles'] ?? 'C:\\Program Files', 'GitHub CLI', 'gh.exe'), join(env['LOCALAPPDATA'] ?? '', 'Programs', 'GitHub CLI', 'gh.exe')] : ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'];
    return extra.find((p) => existsSync(p)) ?? null;
  }

  /** gh 에 로그인한 github.com 계정들 */
  async logins(): Promise<{ readonly installed: boolean; readonly logins: readonly string[] }> {
    const gh = this.gh();
    if (gh === null) return { installed: false, logins: [] };
    const r = await this.exec(gh, ['auth', 'status', '--hostname', 'github.com']);
    return { installed: true, logins: ghLoginsOf(r.out) };
  }

  /** 새 터미널에서 gh auth login(계정 하나 더 추가). 같은 사람의 다른 계정도 여기서 더한다 */
  async login(): Promise<Result<null>> {
    const gh = this.gh();
    if (gh === null) return { ok: false, error: 'GitHub CLI (gh) is not installed. Install it from cli.github.com, then press this again.' };
    const line = terminalLine(this.deps.platform, [gh, 'auth', 'login', '--hostname', 'github.com', '--web', '--git-protocol', 'https']);
    try {
      if (this.deps.platform === 'win32') {
        const bat = join(await mkdtemp(join(tmpdir(), 'rauha-gh-')), 'gh-login.cmd');
        await writeFile(bat, `@echo off\r\necho rauha: add a GitHub account (sign in with the account you want to add)\r\n${line}\r\n`, 'utf8');
        spawn('cmd.exe', ['/c', 'start', 'rauha · GitHub sign-in', 'cmd', '/k', bat], { detached: true, stdio: 'ignore', windowsHide: false, env: this.deps.env }).unref();
      } else if (this.deps.platform === 'darwin') spawn('osascript', ['-e', `tell application "Terminal" to do script "${line.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`, '-e', 'tell application "Terminal" to activate'], { detached: true, stdio: 'ignore' }).unref();
      else spawn('x-terminal-emulator', ['-e', line], { detached: true, stdio: 'ignore' }).unref();
      return { ok: true, data: null };
    } catch {
      return { ok: false, error: `Could not open a terminal. Run "gh auth login" yourself.` };
    }
  }

  private exec(file: string, args: readonly string[]): Promise<{ code: number; out: string }> {
    return this.deps.run !== undefined ? this.deps.run(file, args) : run(file, args, this.deps.env);
  }

  private async token(login: string, only: boolean): Promise<string | null> {
    const gh = this.gh();
    if (gh === null) return null;
    const ok = (t: string): string | null => (/^[A-Za-z0-9_]{20,255}$/.test(t.trim()) ? t.trim() : null);
    const r = await this.exec(gh, ['auth', 'token', '--hostname', 'github.com', '--user', login]);
    const t = r.code === 0 ? ok(r.out.split('\n')[0] ?? '') : null;
    if (t !== null || !only) return t;
    // 옛 gh(--user 없음): 계정이 하나뿐이면 그 토큰
    const r2 = await this.exec(gh, ['auth', 'token', '--hostname', 'github.com']);
    return r2.code === 0 ? ok(r2.out.split('\n')[0] ?? '') : null;
  }

  private async get(path: string, token: string): Promise<{ status: number; json: unknown; text: string }> {
    const f = this.deps.fetch ?? fetch;
    const res = await f(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'rauha-desktop' }, signal: AbortSignal.timeout(20_000) });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* 글이면 그대로 */
    }
    return { status: res.status, json, text };
  }

  async cached(): Promise<RemoteWork | null> {
    try {
      const o = JSON.parse(await readFile(this.deps.cacheFile, 'utf8')) as RemoteWork;
      return Array.isArray(o.commits) && Array.isArray(o.stacks) && typeof o.at === 'string' ? o : null;
    } catch {
      return null;
    }
  }

  /** 계정들로 읽는다. 저장해 둔 것이 하루 안이고 계정이 같으면 그대로(force 면 새로) */
  async scan(logins: readonly string[], force: boolean): Promise<Result<RemoteWork>> {
    const want = [...new Set(logins.map((l) => l.toLowerCase()))].sort();
    if (want.length === 0) return { ok: false, error: 'Link a GitHub account to Personal or Company first.' };
    const old = await this.cached();
    if (!force && old !== null && JSON.stringify([...old.logins].sort()) === JSON.stringify(want) && Date.now() - Date.parse(old.at) < CACHE_MS) return { ok: true, data: old };
    const notes: string[] = [];
    const commits = new Map<string, WorkCommit>();
    const stacks = new Map<string, RepoStack>();
    let repoCount = 0;
    for (const login of want) {
      const token = await this.token(login, want.length === 1);
      if (token === null) {
        notes.push(`${login}: not signed in to the GitHub CLI. Press "Add GitHub account" and sign in as ${login}.`);
        continue;
      }
      const repos: RemoteRepo[] = [];
      for (let page = 1; page <= 3 && repos.length < REPOS_PER_LOGIN; page++) {
        const r = await this.get(`/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`, token).catch(() => null);
        if (r === null || r.status !== 200) {
          notes.push(`${login}: could not list repositories (${r?.status ?? 'network'}).`);
          break;
        }
        const got = reposFromApi(r.json);
        repos.push(...got.filter((x) => !repos.some((y) => y.fullName === x.fullName)));
        if (got.length < 100) break;
      }
      const list = repos.slice(0, REPOS_PER_LOGIN);
      let next = 0;
      const worker = async (): Promise<void> => {
        while (next < list.length) {
          const repo = list[next++]!;
          const mine: WorkCommit[] = [];
          for (let page = 1; page <= COMMIT_PAGES; page++) {
            const r = await this.get(`/repos/${repo.fullName}/commits?author=${encodeURIComponent(login)}&per_page=100&page=${page}`, token).catch(() => null);
            if (r === null) break;
            const sso = ssoHint(r.status, r.text, repo.fullName);
            if (sso !== null && !notes.includes(sso)) notes.push(sso);
            if (r.status !== 200) break;
            const got = commitsFromApi(r.json, repo.fullName, login);
            mine.push(...got);
            if (!Array.isArray(r.json) || r.json.length < 100) break;
          }
          if (mine.length === 0) continue;
          repoCount += 1;
          // 언어 비중: 레포 언어 통계(바이트)로 어림(커밋별 줄 수는 API 로 싸게 못 얻는다)
          const langs = langsByShare((await this.get(`/repos/${repo.fullName}/languages`, token).catch(() => null))?.json ?? null);
          for (const c of mine) if (!commits.has(c.hash)) commits.set(c.hash, { ...c, langs });
          // 파일 트리 → 아키텍처 신호·파일 구성 스택, 얕은 설정 파일 몇 개 → 스택 이름
          const tree = await this.get(`/repos/${repo.fullName}/git/trees/${encodeURIComponent(repo.defaultBranch)}?recursive=1`, token).catch(() => null);
          const paths = tree !== null && tree.status === 200 && typeof tree.json === 'object' && tree.json !== null && Array.isArray((tree.json as { tree?: unknown }).tree) ? ((tree.json as { tree: unknown[] }).tree.filter((e): e is { path: string; type: string; size?: number } => typeof e === 'object' && e !== null && typeof (e as { path?: unknown }).path === 'string' && (e as { type?: unknown }).type === 'blob') as { path: string; size?: number }[]) : [];
          const allPaths = paths.map((p) => p.path).slice(0, 50_000);
          const manifests = paths.filter((p) => isManifestPath(p.path) && (p.size ?? 0) <= MANIFEST_MAX_BYTES).sort((a, b) => a.path.split('/').length - b.path.split('/').length).slice(0, MANIFESTS_PER_REPO);
          const files: { path: string; text: string }[] = [];
          for (const m of manifests) {
            const r = await this.get(`/repos/${repo.fullName}/contents/${m.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(repo.defaultBranch)}`, token).catch(() => null);
            const content = r !== null && r.status === 200 && typeof r.json === 'object' && r.json !== null ? (r.json as { content?: unknown; encoding?: unknown }) : null;
            if (content !== null && content.encoding === 'base64' && typeof content.content === 'string') files.push({ path: m.path, text: Buffer.from(content.content, 'base64').toString('utf8') });
          }
          const stack = [...new Set([...stackOf(files), ...stackFromPaths(allPaths), ...Object.keys(langs).slice(0, 3)])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
          stacks.set(repo.fullName, { repo: repo.fullName, stack, architecture: architectureOf(allPaths) });
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    }
    const data: RemoteWork = { at: new Date().toISOString(), logins: want, repos: repoCount, commits: [...commits.values()], stacks: [...stacks.values()], notes };
    await mkdir(dirname(this.deps.cacheFile), { recursive: true }).catch(() => undefined);
    await writeFile(this.deps.cacheFile, JSON.stringify(data), 'utf8').catch(() => undefined);
    return { ok: true, data };
  }
}
