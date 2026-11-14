import { GitAccounts, resumeNote, summarizeWork, type GitAccount, type WorkCommit, type WorkSummary } from '../shared/my-work.js';
import type { MyWorkApi } from '../shared/my-work-ipc.js';
import { el } from './dom.js';

export interface MyWorkDeps {
  readonly api: MyWorkApi;
  readonly accounts: { get(): Promise<readonly GitAccount[]>; set(next: readonly GitAccount[]): Promise<readonly GitAccount[]> };
  readonly copy: (text: string) => Promise<boolean>;
}

const PERIODS: readonly (readonly [string, number])[] = [['Last 12 months', 365], ['Last 2 years', 730], ['Last 5 years', 1825], ['All time', 0]];

/**
 * 내 작업(이력서용): 개인·회사처럼 여러 git 계정의 작성자 이메일을 "나"로 묶어, 작업 폴더 모든 레포의 커밋을
 * 계정 → 월 → 레포로 센다. 이력서 초안은 커밋 제목과 숫자만 Haiku 에 보낸다(코드는 보내지 않는다).
 */
export function buildMyWork(deps: MyWorkDeps) {
  const root = el('div', 'gpanel mywork');
  let accounts: GitAccount[] = [];
  let commits: readonly WorkCommit[] = [];
  let repos = 0;
  let days = 365;
  let busy = false;
  let draft = '';
  let note = '';

  const head = el('div', 'gtools mw-head');
  const period = el('select', 'sm');
  for (const [label, d] of PERIODS) {
    const o = el('option', undefined, label);
    o.value = String(d);
    period.append(o);
  }
  period.value = String(days);
  period.addEventListener('change', () => ((days = Number(period.value)), void scan()));
  const rescan = el('button', 'btn sm', 'Scan again');
  rescan.addEventListener('click', () => void scan());
  const status = el('span', 'hint grow');
  head.append(el('b', undefined, 'My work across all repos'), status, period, rescan);
  const acctBox = el('div', 'mw-accounts');
  const result = el('div', 'mw-result');
  root.append(head, acctBox, result);

  const save = async (next: GitAccount[]): Promise<void> => {
    accounts = [...(await deps.accounts.set(GitAccounts.from(next).list))];
    paint();
  };

  function paintAccounts(s: WorkSummary): void {
    acctBox.replaceChildren(el('div', 'sub', 'My git accounts — every email here counts as me'));
    const grid = el('div', 'mw-acct-grid');
    accounts.forEach((a, i) => {
      const card = el('div', 'mw-acct');
      const name = el('input', 'sm mw-label');
      name.value = a.label;
      name.addEventListener('change', () => void save(accounts.map((x, j) => (j === i ? { ...x, label: name.value } : x))));
      const chips = el('div', 'mw-emails');
      for (const e of a.emails) {
        const chip = el('span', 'mw-email', e);
        const x = el('button', 'link', '✕');
        x.title = `Remove ${e}`;
        x.addEventListener('click', () => void save(accounts.map((y, j) => (j === i ? { ...y, emails: y.emails.filter((m) => m !== e) } : y)).filter((y) => y.emails.length > 0)));
        chip.append(x);
        chips.append(chip);
      }
      const del = el('button', 'link', 'Remove account');
      del.addEventListener('click', () => void save(accounts.filter((_, j) => j !== i)));
      card.append(name, chips, del);
      grid.append(card);
    });
    acctBox.append(grid);
    // 아직 계정에 넣지 않은 작성자: 내 것이면 골라서 넣는다(직접 입력하지 않아도 되게)
    if (s.others.length > 0) {
      acctBox.append(el('div', 'sub', 'Authors in your repos not in an account yet — add the ones that are you'));
      const list = el('div', 'mw-others');
      for (const o of s.others.slice(0, 20)) {
        const row = el('div', 'mw-other');
        row.append(el('span', 'grow', `${o.name} <${o.email}>`), el('span', 'hint', `${o.commits} commits`));
        for (const a of accounts) {
          const add = el('button', 'btn sm', `+ ${a.label}`);
          add.addEventListener('click', () => void save(accounts.map((x) => (x === a ? { ...x, emails: [...x.emails, o.email] } : x))));
          row.append(add);
        }
        const fresh = el('button', 'btn sm', accounts.length === 0 ? '+ Personal' : accounts.length === 1 ? '+ Company' : '+ New account');
        fresh.addEventListener('click', () => void save([...accounts, { label: accounts.length === 0 ? 'Personal' : accounts.length === 1 ? 'Company' : `Account ${accounts.length + 1}`, emails: [o.email] }]));
        row.append(fresh);
        list.append(row);
      }
      acctBox.append(list);
    }
  }

  function paintSummary(s: WorkSummary): void {
    result.replaceChildren();
    if (accounts.length === 0) return void result.append(el('div', 'dim pad', 'Add your own author emails above (personal and company). Then your commits from both show up here together.'));
    if (s.total === 0) return void result.append(el('div', 'dim pad', 'No commits by these accounts in this period.'));
    const tools = el('div', 'btns');
    const write = el('button', 'btn primary', busy ? 'Writing…' : '✨ Resume bullets');
    write.disabled = busy;
    write.title = 'Sends only commit subjects and counts (no code) to a teammate (Haiku) to draft resume bullets';
    write.addEventListener('click', () => void writeResume(s));
    tools.append(el('span', 'hint grow', `${s.total} commits by you in ${repos} repos`), write);
    result.append(tools);
    if (draft !== '') {
      const box = el('div', 'mw-draft');
      const copy = el('button', 'btn sm', 'Copy markdown');
      copy.addEventListener('click', () => void deps.copy(draft).then((ok) => (copy.textContent = ok ? 'Copied ✓' : 'Could not copy')));
      box.append(el('div', 'btns', ''), el('pre', 'mw-md', draft));
      box.firstChild?.appendChild(copy);
      result.append(box);
    }
    for (const a of s.accounts) {
      const sec = el('section', 'mw-account');
      const span = `${new Date(a.first * 1000).toISOString().slice(0, 7)} ~ ${new Date(a.last * 1000).toISOString().slice(0, 7)}`;
      sec.append(el('h3', undefined, `${a.label} · ${a.commits} commits · +${a.added} −${a.removed} · ${span}`));
      for (const m of a.months) {
        const d = el('details', 'mw-month');
        const total = m.repos.reduce((n, r) => n + r.commits, 0);
        d.append(el('summary', undefined, `${m.month} — ${total} commits in ${m.repos.map((r) => r.repo).join(', ')}`));
        for (const r of m.repos) {
          const row = el('div', 'mw-repo');
          row.append(el('b', undefined, `${r.repo} · ${r.commits} commits · +${r.added} −${r.removed}`));
          const ul = el('ul');
          for (const sub of r.subjects.slice(0, 12)) ul.append(el('li', undefined, sub));
          row.append(ul);
          d.append(row);
        }
        sec.append(d);
      }
      result.append(sec);
    }
  }

  function paint(): void {
    const s = summarizeWork(commits, GitAccounts.from(accounts));
    note = resumeNote(s);
    paintAccounts(s);
    paintSummary(s);
  }

  async function writeResume(s: WorkSummary): Promise<void> {
    if (busy) return;
    busy = true;
    paintSummary(s);
    const r = await deps.api.resume(note);
    busy = false;
    draft = r.ok ? r.data : `(${r.error})`;
    paintSummary(s);
  }

  async function scan(): Promise<void> {
    status.textContent = 'Reading commits from every repo in the work folder…';
    rescan.disabled = true;
    const since = days === 0 ? 0 : Math.floor(Date.now() / 1000) - days * 86400;
    const r = await deps.api.scan(since);
    rescan.disabled = false;
    if (!r.ok) {
      status.textContent = r.error;
      return;
    }
    commits = r.data.commits;
    repos = r.data.repos;
    status.textContent = `${commits.length} commits in ${repos} repos (all branches, merges skipped)`;
    paint();
  }

  void deps.accounts.get().then((a) => {
    accounts = [...a];
    void scan();
  });
  return { root, refresh: async () => {} };
}
