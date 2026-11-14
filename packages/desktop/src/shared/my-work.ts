/**
 * 이력서용 "내 작업": 여러 git 계정(개인·회사 이메일)을 "나"로 묶고, 작업 폴더 레포들의 커밋을 계정 → 월 → 레포로 센다.
 * 커밋 제목과 숫자만 다룬다(코드·파일 이름은 이력서 메모로 보내지 않는다).
 */
export interface GitAccount {
  readonly label: string;
  readonly emails: readonly string[];
}

const EMAIL = /^[^\s@]+@[^\s@]+$/;
const LABEL_MAX = 40;
const ACCOUNTS_MAX = 10;
const EMAILS_MAX = 20;

/** 내 계정 목록(값 객체). 이메일은 소문자로 한 번만 */
export class GitAccounts {
  private constructor(readonly list: readonly GitAccount[]) {}

  static from(raw: unknown): GitAccounts {
    const out: GitAccount[] = [];
    for (const a of Array.isArray(raw) ? raw.slice(0, ACCOUNTS_MAX) : []) {
      if (typeof a !== 'object' || a === null) continue;
      const o = a as Record<string, unknown>;
      const label = typeof o['label'] === 'string' ? o['label'].trim().slice(0, LABEL_MAX) : '';
      const emails = [...new Set((Array.isArray(o['emails']) ? o['emails'] : []).filter((e): e is string => typeof e === 'string').map((e) => e.trim().toLowerCase()).filter((e) => EMAIL.test(e)))].slice(0, EMAILS_MAX);
      if (label !== '' && emails.length > 0) out.push({ label, emails });
    }
    return new GitAccounts(out);
  }

  labelOf(email: string): string | null {
    const e = email.trim().toLowerCase();
    return this.list.find((a) => a.emails.includes(e))?.label ?? null;
  }
}

export interface WorkCommit {
  readonly repo: string;
  readonly hash: string;
  readonly name: string;
  readonly email: string;
  /** 초 단위 UNIX 시각 */
  readonly at: number;
  readonly subject: string;
  readonly added: number;
  readonly removed: number;
  readonly files: number;
}

/** git log 형식: 커밋 줄은 "@@" + 해시·이름·이메일·시각·제목(\x1f 로 구분), 그 뒤 --numstat 줄들 */
export const WORK_LOG_FORMAT = '@@%H%x1f%an%x1f%ae%x1f%at%x1f%s';

export function parseWorkLog(text: string, repo: string): WorkCommit[] {
  const out: { repo: string; hash: string; name: string; email: string; at: number; subject: string; added: number; removed: number; files: number }[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('@@')) {
      const [hash = '', name = '', email = '', at = '0', subject = ''] = line.slice(2).split('\u001f');
      if (hash !== '') out.push({ repo, hash, name, email, at: Number(at) || 0, subject, added: 0, removed: 0, files: 0 });
      continue;
    }
    const m = /^(\d+|-)\t(\d+|-)\t/.exec(line);
    const cur = out[out.length - 1];
    if (m === null || cur === undefined) continue;
    cur.added += m[1] === '-' ? 0 : Number(m[1]);
    cur.removed += m[2] === '-' ? 0 : Number(m[2]);
    cur.files += 1;
  }
  return out;
}

export interface RepoWork {
  readonly repo: string;
  readonly commits: number;
  readonly added: number;
  readonly removed: number;
  readonly subjects: readonly string[];
}
export interface MonthWork {
  readonly month: string;
  readonly repos: readonly RepoWork[];
}
export interface AccountWork {
  readonly label: string;
  readonly commits: number;
  readonly added: number;
  readonly removed: number;
  readonly first: number;
  readonly last: number;
  readonly months: readonly MonthWork[];
}
export interface WorkSummary {
  readonly total: number;
  readonly accounts: readonly AccountWork[];
  /** 아직 어느 계정에도 넣지 않은 작성자(많이 쓴 순) */
  readonly others: readonly { readonly name: string; readonly email: string; readonly commits: number }[];
}

const monthOf = (at: number): string => new Date(at * 1000).toISOString().slice(0, 7);
const SUBJECTS_PER_REPO = 30;

export function summarizeWork(commits: readonly WorkCommit[], accounts: GitAccounts): WorkSummary {
  const mine = new Map<string, WorkCommit[]>();
  const others = new Map<string, { name: string; email: string; commits: number }>();
  for (const c of commits) {
    const label = accounts.labelOf(c.email);
    if (label === null) {
      const k = c.email.toLowerCase();
      const o = others.get(k) ?? { name: c.name, email: c.email, commits: 0 };
      o.commits += 1;
      others.set(k, o);
      continue;
    }
    mine.set(label, [...(mine.get(label) ?? []), c]);
  }
  const accountsOut: AccountWork[] = [...mine.entries()].map(([label, list]) => {
    const byMonth = new Map<string, Map<string, WorkCommit[]>>();
    for (const c of list) {
      const m = byMonth.get(monthOf(c.at)) ?? new Map<string, WorkCommit[]>();
      m.set(c.repo, [...(m.get(c.repo) ?? []), c]);
      byMonth.set(monthOf(c.at), m);
    }
    const months = [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, repos]) => ({
        month,
        repos: [...repos.entries()].map(([repo, cs]) => ({ repo, commits: cs.length, added: cs.reduce((n, c) => n + c.added, 0), removed: cs.reduce((n, c) => n + c.removed, 0), subjects: [...new Set(cs.map((c) => c.subject))].slice(0, SUBJECTS_PER_REPO) })).sort((a, b) => b.commits - a.commits),
      }));
    const ats = list.map((c) => c.at);
    return { label, commits: list.length, added: list.reduce((n, c) => n + c.added, 0), removed: list.reduce((n, c) => n + c.removed, 0), first: Math.min(...ats), last: Math.max(...ats), months };
  });
  accountsOut.sort((a, b) => b.last - a.last);
  return { total: accountsOut.reduce((n, a) => n + a.commits, 0), accounts: accountsOut, others: [...others.values()].sort((a, b) => b.commits - a.commits) };
}

const NOTE_MAX = 12_000;

/** 이력서 초안을 쓸 모델에 보낼 메모: 계정·기간·레포별 커밋 제목과 숫자만 */
export function resumeNote(s: WorkSummary): string {
  const lines: string[] = [];
  for (const a of s.accounts) {
    lines.push(`## ${a.label} account: ${a.commits} commits (+${a.added} −${a.removed}), ${monthOf(a.first)} ~ ${monthOf(a.last)}`);
    for (const m of a.months) for (const r of m.repos) lines.push(`- ${m.month} · ${r.repo} · ${r.commits} commits: ${r.subjects.join(' / ')}`);
  }
  const text = lines.join('\n');
  return text.length > NOTE_MAX ? `${text.slice(0, NOTE_MAX)}\n(cut)` : text;
}
