import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asRecord } from '../../shared/validation.js';
import type { ChecksPort, TestsResult } from '../application/ports.js';
import { VitestReportDto } from '../application/dto/vitest-report.dto.js';
import { TestRun } from '../domain/test-run.js';
import type { CheckName, CheckResult } from '../domain/verification.js';

export type PackageManager = 'yarn' | 'pnpm' | 'npm';
type SuiteCheck = Exclude<CheckName, 'locked-tests'>;

interface PackageJson {
  readonly scripts?: Record<string, string>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

const SCRIPT: Readonly<Record<SuiteCheck, string>> = { tests: 'test', typecheck: 'typecheck', lint: 'lint' };
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** 대상 Node 프로젝트에서 어떤 명령으로 검사할지. 파일을 읽지 않는 순수 판단만 한다. */
export class NodeProject {
  private constructor(
    readonly packageManager: PackageManager,
    private readonly pkg: PackageJson,
    private readonly hasTsconfig: boolean,
  ) {}

  static detect(files: readonly string[], pkg: PackageJson): NodeProject {
    const pm: PackageManager = files.includes('yarn.lock') ? 'yarn' : files.includes('pnpm-lock.yaml') ? 'pnpm' : 'npm';
    return new NodeProject(pm, pkg, files.includes('tsconfig.json'));
  }

  /** `src/a.ts(3,7): error TS2322` / `src/a.ts:3:7 - error TS2322` → `src/a.ts:TS2322` */
  static typeErrorIds(output: string): string[] {
    const ids: string[] = [];
    for (const m of output.matchAll(/^(.+?)(?:\(\d+,\d+\)|:\d+:\d+)\s*[:-]\s*error (TS\d+)/gm)) {
      ids.push(`${(m[1] as string).trim()}:${m[2]}`);
    }
    return [...new Set(ids)];
  }

  /** 실패 출력에서 다음 시도에 넘길 부분. 에러가 적힌 줄을 먼저, 나머지는 끝부분에서 채운다. */
  static failureDetail(output: string, maxLines = 12): string {
    const lines = output
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l) => l.trim() !== '' && !l.startsWith('> '));
    const errors = lines.filter((l) => /\berror\b|Error:|✗|×|FAIL/i.test(l));
    const rest = lines.filter((l) => !errors.includes(l)).slice(-maxLines);
    return [...errors, ...rest].slice(0, maxLines).join('\n');
  }

  usesVitest(): boolean {
    const deps = { ...this.pkg.dependencies, ...this.pkg.devDependencies };
    return 'vitest' in deps || /\bvitest\b/.test(this.pkg.scripts?.['test'] ?? '');
  }

  suiteCommand(check: SuiteCheck): string | null {
    if (this.pkg.scripts?.[SCRIPT[check]] !== undefined) return `${this.packageManager} run ${SCRIPT[check]}`;
    if (check === 'typecheck' && this.hasTsconfig) return `${this.exec()} tsc --noEmit`;
    return null;
  }

  /** 전체 테스트를 JSON reporter로 돌리는 명령(vitest일 때만). */
  suiteTestsJsonCommand(outFile: string): string | null {
    const base = this.suiteCommand('tests');
    if (base === null || !this.usesVitest()) return null;
    const sep = this.packageManager === 'npm' ? ' --' : '';
    return `${base}${sep} --reporter=json ${shellQuote(`--outputFile=${outFile}`)}`;
  }

  testFilesCommand(files: readonly string[], outFile: string): string {
    const quoted = files.map(shellQuote).join(' ');
    if (this.usesVitest()) return `${this.exec()} vitest run ${quoted} --reporter=json ${shellQuote(`--outputFile=${outFile}`)}`;
    const sep = this.packageManager === 'npm' ? ' --' : '';
    return `${this.packageManager} run test${sep} ${quoted}`;
  }

  private exec(): string {
    return this.packageManager === 'npm' ? 'npx --no-install' : `${this.packageManager} exec`;
  }
}

/** 공백·특수 문자가 든 인자만 큰따옴표로 감싼다(cmd.exe와 POSIX 셸 모두 받는 형태). */
function shellQuote(arg: string): string {
  return /^[\w./:@=+,-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '\\"')}"`;
}

/**
 * vitest 보고서 + 종료 코드 → TestRun. 보고서가 통과여도 종료 코드가 0이 아니면
 * (처리되지 않은 오류 등) 실패로 본다. 보고서가 없으면 종료 코드만으로 판정한다.
 */
export function testsOutcome(report: VitestReportDto | null, exitCode: number): TestRun {
  if (report === null) {
    return exitCode === 0 ? TestRun.of({ passed: 1, failed: 0 }) : TestRun.of({ passed: 0, failed: 1, failedNames: ['(세부 정보 없음)'] });
  }
  const run = report.toTestRun();
  if (run.failed > 0 || exitCode === 0) return run;
  return TestRun.of({ passed: run.passed, failed: 1, failureKind: 'compile', failedNames: [`(처리되지 않은 오류: 종료 코드 ${exitCode})`] });
}

interface CommandResult {
  readonly code: number;
  readonly output: string;
}

/** 대상 프로젝트에서 검사 명령을 실제로 실행한다. 판정은 Verification·TestRun이 한다. */
export class NodeChecks implements ChecksPort {
  constructor(
    private readonly root: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async runTests(files: readonly string[]): Promise<TestsResult> {
    const project = await this.project();
    const outFile = this.tempFile();
    const command = project.testFilesCommand(files, outFile);
    const result = await this.exec(command);
    const report = await this.readVitest(outFile);
    const run = testsOutcome(report, result.code);
    const reportDigest = report?.failureDigest() ?? '';
    const digest = run.failed === 0 ? '' : reportDigest !== '' ? reportDigest : tail(result.output, 12);
    return { run, ids: [...run.failedNames], digest, command: this.display(command, outFile) };
  }

  async runSuite(): Promise<CheckResult[]> {
    const project = await this.project();
    const results: CheckResult[] = [];
    for (const name of ['tests', 'typecheck', 'lint'] as const) {
      results.push(await this.runCheck(project, name));
    }
    return results;
  }

  private async runCheck(project: NodeProject, name: SuiteCheck): Promise<CheckResult> {
    const plain = project.suiteCommand(name);
    if (plain === null) return { name, status: 'skip', failures: [], command: null, summary: '스크립트 없음' };

    if (name === 'tests') {
      const outFile = this.tempFile();
      const json = project.suiteTestsJsonCommand(outFile);
      if (json !== null) {
        const result = await this.exec(json);
        const report = await this.readVitest(outFile);
        const run = testsOutcome(report, result.code);
        const summary = report !== null ? `통과 ${run.passed} / 실패 ${run.failed}` : run.isGreen() ? '통과' : tail(result.output, 1);
        const detail = run.isGreen() ? '' : (report?.failureDigest() || NodeProject.failureDetail(result.output));
        return {
          name,
          status: run.isGreen() ? 'pass' : 'fail',
          failures: report !== null ? [...run.failedNames] : [],
          command: plain,
          summary,
          ...(detail !== '' ? { detail } : {}),
        };
      }
    }

    const result = await this.exec(plain);
    const failures = name === 'typecheck' ? NodeProject.typeErrorIds(result.output) : [];
    const summary = result.code === 0 ? '통과' : name === 'typecheck' ? `타입 에러 ${failures.length}개` : `실패: ${tail(result.output, 1)}`;
    const detail = result.code === 0 ? '' : NodeProject.failureDetail(result.output);
    return { name, status: result.code === 0 ? 'pass' : 'fail', failures, command: plain, summary, ...(detail !== '' ? { detail } : {}) };
  }

  private async project(): Promise<NodeProject> {
    const files = await readdir(this.root);
    const pkgPath = join(this.root, 'package.json');
    const pkg = existsSync(pkgPath) ? (asRecord(JSON.parse(await readFile(pkgPath, 'utf8')), 'package.json') as PackageJson) : {};
    return NodeProject.detect(files, pkg);
  }

  private async readVitest(outFile: string): Promise<VitestReportDto | null> {
    if (!existsSync(outFile)) return null;
    try {
      return VitestReportDto.from(JSON.parse(await readFile(outFile, 'utf8')));
    } catch {
      return null;
    } finally {
      await rm(outFile, { force: true });
    }
  }

  private tempFile(): string {
    return join(tmpdir(), `rauha-vitest-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`).replace(/\\/g, '/');
  }

  private display(command: string, outFile: string): string {
    return command.replace(` --reporter=json ${shellQuote(`--outputFile=${outFile}`)}`, '');
  }

  private exec(command: string): Promise<CommandResult> {
    return new Promise((resolve) => {
      const child = spawn(command, {
        cwd: this.root,
        shell: true,
        env: { ...process.env, CI: '1', FORCE_COLOR: '0', NO_COLOR: '1' },
        windowsHide: true,
      });
      let output = '';
      const collect = (chunk: Buffer) => {
        output += chunk.toString();
        if (output.length > 2_000_000) output = output.slice(-1_000_000);
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      let settled = false;
      const settle = (result: CommandResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      // 시간 제한: 셸 아래의 프로세스까지 트리째 끄고, close를 기다리지 않고 결과를 확정한다.
      const timer = setTimeout(() => {
        void killTree(child.pid).then(() =>
          settle({ code: 124, output: `${output}\n시간 제한(${Math.round(this.timeoutMs / 1000)}초)을 넘겨 중단했습니다.` }),
        );
      }, this.timeoutMs);
      child.on('close', (code) => settle({ code: code ?? 1, output }));
      child.on('error', (error) => settle({ code: 1, output: `${output}\n${error.message}` }));
    });
  }
}

function runQuiet(command: string, args: readonly string[]): Promise<string> {
  return new Promise((done) => {
    const child = spawn(command, args, { windowsHide: true });
    let out = '';
    child.stdout?.on('data', (d: Buffer) => {
      out += d.toString();
    });
    child.on('close', () => done(out));
    child.on('error', () => done(out));
  });
}

/** Windows 프로세스 목록: [pid, 부모 pid] */
async function windowsProcesses(): Promise<[number, number][]> {
  const out = await runQuiet('powershell', [
    '-NoProfile',
    '-Command',
    'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId)" }',
  ]);
  return out
    .split('\n')
    .map((l) => l.trim().split(/\s+/).map(Number))
    .filter((p): p is [number, number] => p.length === 2 && p.every(Number.isFinite));
}

const SWEEP_ROUNDS = 3;

/**
 * 셸과 그 아래 프로세스를 모두 끈다. Windows의 taskkill /T는 트리를 훑은 직후에 생긴 자식을
 * 놓칠 수 있고, 그 부모가 죽으면 다시 찾을 수 없다. 그래서 끈 PID를 기억해 두고, 그 PID를 부모로
 * 가진 고아를 새로 나오지 않을 때까지 몇 번 더 찾아 끈다.
 */
async function killTree(pid: number | undefined): Promise<void> {
  if (pid === undefined) return;
  if (process.platform === 'win32') {
    const known = new Set<number>([pid]);
    const collect = (procs: readonly [number, number][]) => {
      let grew = true;
      while (grew) {
        grew = false;
        for (const [child, parent] of procs) {
          if (known.has(parent) && !known.has(child)) {
            known.add(child);
            grew = true;
          }
        }
      }
    };
    collect(await windowsProcesses());
    await runQuiet('taskkill', ['/pid', String(pid), '/T', '/F']);
    for (let round = 0; round < SWEEP_ROUNDS; round += 1) {
      const before = known.size;
      const procs = await windowsProcesses();
      collect(procs);
      const alive = procs.filter(([p]) => known.has(p)).map(([p]) => p);
      for (const p of alive) {
        try {
          process.kill(p, 'SIGKILL');
        } catch {
          // 이미 끝났다.
        }
      }
      if (alive.length === 0 && known.size === before) break;
    }
    return;
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // 이미 끝났다.
  }
  return Promise.resolve();
}

function tail(text: string, lines: number): string {
  return text
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '')
    .slice(-lines)
    .join('\n');
}
