import { githubAuthor, type WorkCommit } from './my-work.js';

/**
 * clone 없이 GitHub 에서 내 작업 읽기: gh CLI 에 로그인한 여러 계정(개인·회사)으로 API 를 읽는다.
 * 여기는 응답을 거르는 규칙만(바깥 입력을 믿지 않는다). 토큰은 main 에서만 쓰고 화면으로 보내지 않는다.
 */
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const FULL_NAME = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const BRANCH = /^[^\s~^:?*[\\]{1,200}$/;

/** `gh auth status` 출력에서 github.com 에 로그인된 계정들 */
export function ghLoginsOf(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/Logged in to github\.com (?:account|as) (\S+)/g)) {
    const login = m[1]!.replace(/[()]/g, '');
    if (LOGIN.test(login) && !out.includes(login)) out.push(login);
  }
  return out;
}

export interface RemoteRepo {
  readonly fullName: string;
  readonly defaultBranch: string;
  readonly pushedAt: string;
  readonly fork: boolean;
  readonly private: boolean;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** /user/repos 응답 → 레포(보관된 것 빼고, 최근 푸시 순) */
export function reposFromApi(json: unknown): RemoteRepo[] {
  const out: RemoteRepo[] = [];
  for (const r of Array.isArray(json) ? json : []) {
    if (!isObj(r) || r['archived'] === true) continue;
    const fullName = typeof r['full_name'] === 'string' && FULL_NAME.test(r['full_name']) && !r['full_name'].includes('..') ? r['full_name'] : null;
    const defaultBranch = typeof r['default_branch'] === 'string' && BRANCH.test(r['default_branch']) ? r['default_branch'] : null;
    if (fullName === null || defaultBranch === null) continue;
    out.push({ fullName, defaultBranch, pushedAt: typeof r['pushed_at'] === 'string' ? r['pushed_at'] : '', fork: r['fork'] === true, private: r['private'] === true });
  }
  return out.sort((a, b) => b.pushedAt.localeCompare(a.pushedAt));
}

/** /repos/{r}/commits?author=<로그인> 응답 → 내 커밋(병합 커밋 빼고). 줄 수는 API 로 싸게 못 얻어 0 */
export function commitsFromApi(json: unknown, repo: string, login: string): WorkCommit[] {
  const out: WorkCommit[] = [];
  for (const c of Array.isArray(json) ? json : []) {
    if (!isObj(c) || !isObj(c['commit']) || typeof c['sha'] !== 'string' || !/^[0-9a-f]{7,64}$/.test(c['sha'])) continue;
    if (Array.isArray(c['parents']) && c['parents'].length > 1) continue;
    const commit = c['commit'];
    const author = isObj(commit['author']) ? commit['author'] : {};
    const at = typeof author['date'] === 'string' ? Date.parse(author['date']) / 1000 : NaN;
    const message = typeof commit['message'] === 'string' ? commit['message'] : '';
    if (!Number.isFinite(at) || message.trim() === '') continue;
    out.push({ repo, hash: c['sha'], name: typeof author['name'] === 'string' ? author['name'].slice(0, 100) : login, email: githubAuthor(login), at, subject: message.split('\n')[0]!.slice(0, 300), added: 0, removed: 0, files: 0, langs: {} });
  }
  return out;
}

/** /repos/{r}/languages(바이트) → 비중(합 약 100, 1% 미만은 버림) */
export function langsByShare(json: unknown): Record<string, number> {
  if (!isObj(json)) return {};
  const entries = Object.entries(json).filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0 && e[0].length <= 40);
  const total = entries.reduce((n, [, b]) => n + b, 0);
  const out: Record<string, number> = {};
  for (const [lang, b] of entries) {
    const share = Math.round((b / total) * 100);
    if (share >= 1) out[lang] = share;
  }
  return out;
}

/** 조직 SAML SSO 로 막혔을 때 고치는 법 */
export function ssoHint(status: number, body: string, repo: string): string | null {
  if (status !== 403 || !/SAML|single sign-on|SSO/i.test(body)) return null;
  return `${repo}: this organization uses SSO. Run "gh auth refresh -h github.com" and authorize the organization (${repo.split('/')[0]}) in the browser, then refresh.`;
}
