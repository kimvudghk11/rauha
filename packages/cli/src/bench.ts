import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DomainError, type Profile, type RunOutcome } from '@rauha/core';
import { noUser, refuseAll } from './ask.js';
import { runOnce } from './run.js';

interface BenchRequest {
  readonly id: string;
  readonly request: string;
}

interface BenchRow {
  readonly id: string;
  readonly result: string;
  readonly attempts: number;
  readonly seconds: number;
  readonly haikuTokens: number;
  readonly sonnetTokens: number;
  readonly costUsd: number;
  readonly firstTry: boolean;
  readonly logDir: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

function stamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${pad(Math.round(seconds % 60))}`;
}

function tokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

function toRow(id: string, outcome: RunOutcome): BenchRow {
  return {
    id,
    result: outcome.status === 'complete' ? '완료' : `멈춤(${outcome.stopReason})`,
    attempts: outcome.implementerAttempts,
    seconds: outcome.durationMs / 1000,
    haikuTokens: outcome.usage.haiku.tokens,
    sonnetTokens: outcome.usage.sonnet.tokens,
    costUsd: outcome.costUsd,
    firstTry: outcome.status === 'complete' && outcome.implementerAttempts === 1,
    logDir: outcome.logDir,
  };
}

/**
 * 복사본 위치. rauha 저장소 안에 두면 팀원이 상위 폴더의 rauha CLAUDE.md(rauha 자체 개발 규칙)를
 * 물려받아 "기존 구조를 따르는가" 측정이 흐려지므로, 저장소 밖 임시 폴더에 둔다.
 */
export function benchCopyDir(stamp: string, id: string): string {
  return join(tmpdir(), 'rauha-bench', stamp, id);
}

/**
 * 연습용 프로젝트를 새로 복사해 git 출발점을 만든다. rauha가 커밋하는 유일한 곳(임시 복사본)이다.
 * 의존성(vitest, typescript)은 rauha의 node_modules를 junction으로 연결해 쓴다.
 */
export async function freshSandbox(source: string, target: string, nodeModules: string): Promise<void> {
  await cp(source, target, { recursive: true, filter: (src) => !src.includes('node_modules') });
  await symlink(nodeModules, join(target, 'node_modules'), 'junction');
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=rauha-bench', '-c', 'user.email=bench@rauha.local', ...args], { cwd: target, stdio: 'ignore' });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-qm', 'bench start');
}

function table(rows: readonly BenchRow[], promptHash: string, startedAt: Date): string {
  const head = ['요청', '결과', '시도', '시간', 'haiku 토큰', 'sonnet 토큰', '추정 비용'];
  const body = rows.map((r) => [r.id, r.result, String(r.attempts), clock(r.seconds), tokens(r.haikuTokens), tokens(r.sonnetTokens), `$${r.costUsd.toFixed(3)}`]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => (b[i] as string).length)));
  const line = (cells: readonly string[]) => cells.map((c, i) => c.padEnd(widths[i] as number)).join('  ');
  const done = rows.filter((r) => r.result === '완료');
  const avg = rows.length > 0 ? rows.reduce((n, r) => n + r.seconds, 0) / rows.length : 0;
  const total = rows.reduce((n, r) => n + r.costUsd, 0);
  return [
    `프롬프트 ${promptHash} · ${startedAt.toISOString().slice(0, 16).replace('T', ' ')}`,
    line(head),
    ...body.map(line),
    `첫 시도 성공 ${rows.filter((r) => r.firstTry).length}/${rows.length} · 완료 ${done.length}/${rows.length} · 평균 ${clock(avg)} · 합계 $${total.toFixed(3)}`,
  ].join('\n');
}

/** 고정 요청 묶음을 매번 새 복사본에서 돌려 프롬프트 버전끼리 비교한다. */
export async function runBench(props: { repoRoot: string; profile: Profile; home: string; only: string | null; log: (line: string) => void }): Promise<string> {
  const sandbox = join(props.repoRoot, 'examples', 'sandbox');
  const requestsFile = join(props.repoRoot, 'examples', 'bench', 'requests.json');
  if (!existsSync(sandbox) || !existsSync(requestsFile)) {
    throw new DomainError('NO_BENCH', 'examples/sandbox 와 examples/bench/requests.json 이 있는 rauha 저장소 루트에서 실행하세요.');
  }
  const all = JSON.parse(await readFile(requestsFile, 'utf8')) as BenchRequest[];
  const requests = props.only === null ? all : all.filter((r) => r.id === props.only);
  if (requests.length === 0) throw new DomainError('NO_BENCH', `요청 id를 찾지 못했습니다: ${props.only}`);

  const startedAt = new Date();
  const benchDir = join(props.repoRoot, '.rauha', 'bench', stamp(startedAt));
  await mkdir(benchDir, { recursive: true });
  const rows: BenchRow[] = [];
  let promptHash = '';

  for (const req of requests) {
    const copy = benchCopyDir(stamp(startedAt), req.id);
    await freshSandbox(sandbox, copy, join(props.repoRoot, 'node_modules'));
    props.log(`── ${req.id}: ${req.request}`);
    try {
      const { outcome, promptHash: hash } = await runOnce(req.request, {
        root: copy,
        profile: props.profile,
        home: props.home,
        ask: refuseAll(props.log),
        user: noUser,
        progress: { step: (m) => props.log(`   ${m}`) },
        requireClean: true,
      });
      promptHash = hash;
      rows.push(toRow(req.id, outcome));
      props.log(`   → ${outcome.status === 'complete' ? '완료' : `멈춤(${outcome.stopReason})`} · ${outcome.logDir}`);
    } catch (error) {
      props.log(`   → 오류: ${(error as Error).message}`);
      rows.push({ id: req.id, result: '오류', attempts: 0, seconds: 0, haikuTokens: 0, sonnetTokens: 0, costUsd: 0, firstTry: false, logDir: null });
    }
  }

  const report = table(rows, promptHash, startedAt);
  await writeFile(join(benchDir, 'bench.md'), `\`\`\`\n${report}\n\`\`\`\n`, 'utf8');
  await writeFile(join(benchDir, 'bench.json'), `${JSON.stringify({ promptHash, rows }, null, 2)}\n`, 'utf8');
  return `${report}\n\n저장: ${benchDir}`;
}
