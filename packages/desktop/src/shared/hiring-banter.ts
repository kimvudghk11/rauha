import type { Line, WorkFacts } from './interview-ipc.js';
import type { WorkSummary } from './my-work.js';

/**
 * 채용 검토실에서 결과를 기다리는 동안 담당자 셋이 나누는 말.
 * 내 커밋에서 바로 센 사실(레포·커밋 수·제목·기간)과 각자 맡은 기준의 출처만 말한다. 통과·탈락 같은 판정은 지어내지 않는다.
 */
const SAMPLE_MAX = 12;
const monthOf = (at: number): string => new Date(at * 1000).toISOString().slice(0, 7);

export function workFacts(s: WorkSummary): WorkFacts {
  const repos = new Map<string, number>();
  const samples: string[] = [];
  for (const a of s.accounts)
    for (const m of a.months)
      for (const r of m.repos) {
        repos.set(r.repo, (repos.get(r.repo) ?? 0) + r.commits);
        for (const sub of r.subjects.slice(0, 2)) if (samples.length < SAMPLE_MAX && !samples.includes(sub)) samples.push(sub);
      }
  const lines = new Map<string, number>();
  for (const a of s.accounts) for (const l of a.langs) lines.set(l.lang, (lines.get(l.lang) ?? 0) + l.lines);
  const changed = [...lines.values()].reduce((n, x) => n + x, 0);
  return {
    total: s.total,
    langs: [...lines.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([lang, n]) => ({ lang, share: changed === 0 ? 0 : Math.round((n / changed) * 100) })),
    stack: [...new Set(s.stacks.flatMap((r) => r.stack))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    accounts: s.accounts.map((a) => ({ label: a.label, commits: a.commits, from: monthOf(a.first), to: monthOf(a.last) })),
    repos: [...repos.entries()].map(([repo, commits]) => ({ repo, commits })).sort((a, b) => b.commits - a.commits),
    samples,
  };
}

interface Crew {
  readonly name: string;
  readonly by: string;
  readonly rule: string;
}

/** 0..n-1 을 seed 로 섞는다(같은 seed 면 같은 순서) */
function shuffled<T>(list: readonly T[], seed: number): T[] {
  const out = [...list];
  let x = (seed + 1) * 2654435761;
  for (let i = out.length - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) >>> 0;
    const j = x % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** 기준 소개: 짧으면 통째로(마침표 빼고), 길면 첫 문장만 */
const firstClause = (rule: string): string => (rule.length <= 40 ? rule : rule.split(/[.。:]/)[0]!).trim().replace(/\.$/, '');

/** 검토 중 대화 한 바퀴(seed = 회사 순번). 화면은 이것을 차례로 말풍선으로 띄우고, 결과가 오면 실제 토론으로 바꾼다 */
export function waitingTalk(crew: readonly Crew[], f: WorkFacts, seed: number, wants?: readonly string[], applicants?: number): Line[] {
  const top = f.repos[0];
  const second = f.repos[1];
  const sample = (i: number): string | undefined => f.samples[(i + seed) % Math.max(1, f.samples.length)];
  const facts: string[] = [];
  if (f.total > 0) facts.push(`전체 커밋이 ${f.total}개네요. 나눠서 읽어 볼게요.`);
  if (top !== undefined) facts.push(`${top.repo} 레포가 ${top.commits}개로 제일 많아요. 여기부터 보죠.`);
  if (second !== undefined) facts.push(`${second.repo}에도 ${second.commits}개 있어요. 둘이 어떻게 이어지는지 궁금하네요.`);
  for (const a of f.accounts.slice(0, 2)) facts.push(`${a.label} 계정으로 ${a.from}부터 ${a.to}까지 ${a.commits}개를 남겼어요.`);
  if (f.accounts.length > 1) facts.push('계정이 둘로 나뉘어 있네요. 옮긴 시점 앞뒤를 같이 봐야겠어요.');
  if (sample(0) !== undefined) facts.push(`'${sample(0)}' 이 커밋 제목 좀 보세요.`);
  if (sample(3) !== undefined && sample(3) !== sample(0)) facts.push(`'${sample(3)}'은 어떤 맥락이었을까요?`);
  const lang = f.langs[0];
  if (lang !== undefined) facts.push(`바꾼 줄의 ${lang.share}%가 ${lang.lang}예요.`);
  if (f.langs[1] !== undefined) facts.push(`${f.langs[1].lang}도 ${f.langs[1].share}% 있네요.`);
  if (f.stack.length > 0) facts.push(`설정 파일을 보면 ${f.stack.slice(0, 4).join(', ')}${f.stack.length > 4 ? ` 외 ${f.stack.length - 4}개` : ''}를 써요.`);
  if (wants !== undefined && wants.length > 0) facts.push(`우리 공고는 ${wants.slice(0, 3).join(', ')}를 원하죠. 겹치는 게 있는지 볼게요.`);
  if (applicants !== undefined) facts.push(`이번 자리에 지원자가 ${applicants}명쯤 와요. 그 사이에서 어디쯤일지 봐야죠.`);
  if (f.repos.length > 2) facts.push(`레포가 ${f.repos.length}개라 시간이 조금 걸리겠어요.`);
  const asides = ['아직 결론 내리긴 일러요. 조금만 더 볼게요.', '커피 한 잔 더 가져올까요?', '메모해 둘게요.', '좋아요, 다음 페이지로 넘길게요.'];
  // 담당자마다 자기 기준의 출처를 밝히는 말 하나
  const own = crew.map((c) => ({ who: c.name, text: `저는 ${c.by}의 기준으로 볼게요. "${firstClause(c.rule)}".` }));
  const pool = shuffled([...facts, ...asides.slice(0, 2)], seed);
  const lines: Line[] = [];
  const order = shuffled(crew.map((_, i) => i), seed);
  // 처음 세 줄은 각자 기준 소개, 그 뒤로 사실 이야기를 번갈아
  for (const i of order) lines.push(own[i]!);
  pool.forEach((text, k) => lines.push({ who: crew[order[k % order.length]!]!.name, text }));
  // 같은 사람이 두 번 잇따라 말하지 않게(소개 끝과 사실 첫 줄이 겹치는 경우)
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.who !== lines[i - 1]!.who) continue;
    const other = crew.find((c) => c.name !== lines[i - 1]!.who && c.name !== lines[i + 1]?.who) ?? crew.find((c) => c.name !== lines[i - 1]!.who);
    if (other !== undefined) lines[i] = { who: other.name, text: lines[i]!.text };
  }
  return lines;
}
