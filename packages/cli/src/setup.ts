import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, win32, posix } from 'node:path';

/**
 * rauha setup: 어느 폴더에서든 `rauha`로 부를 수 있게, PATH에 있는 폴더에 실행 파일(shim)을 둔다.
 * Yarn 4에는 전역 설치가 없어서 직접 둔다. shim은 이 저장소의 빌드 결과(dist/main.js)를 부르므로
 * rauha update로 갱신하면 그대로 새 버전이 불린다.
 */

export interface Shim {
  readonly name: string;
  readonly content: string;
  readonly mode?: number;
}

export function pickBinDir(p: { platform: string; pathEnv: string; appData: string | null; home: string }): { dir: string; onPath: boolean } {
  const windows = p.platform === 'win32';
  const path = windows ? win32 : posix;
  const fold = (dir: string) => {
    const trimmed = dir.replace(/[\\/]+$/, '');
    return windows ? trimmed.toLowerCase() : trimmed;
  };
  const onPath = new Set(p.pathEnv.split(windows ? ';' : ':').filter((d) => d !== '').map(fold));
  const candidates = windows ? (p.appData !== null ? [path.join(p.appData, 'npm')] : []) : [path.join(p.home, '.local', 'bin'), path.join(p.home, 'bin')];
  const found = candidates.find((dir) => onPath.has(fold(dir)));
  return found !== undefined ? { dir: found, onPath: true } : { dir: path.join(p.home, '.rauha', 'bin'), onPath: false };
}

/**
 * 명령을 친 폴더를 INIT_CWD로 넘긴다(main.ts는 `yarn rauha` 때문에 INIT_CWD를 먼저 본다).
 * powershell: PowerShell이 스크립트를 허용할 때만 ps1을 만든다. 막혀 있는데 ps1이 있으면 PowerShell이 cmd로 넘어가지 않고 오류를 낸다.
 */
export function shims(p: { platform: string; entry: string; powershell: boolean }): Shim[] {
  if (p.platform !== 'win32') {
    return [{ name: 'rauha', content: `#!/bin/sh\nINIT_CWD="$PWD" exec node "${p.entry}" "$@"\n`, mode: 0o755 }];
  }
  const forward = p.entry.replace(/\\/g, '/');
  const files: Shim[] = [
    { name: 'rauha.cmd', content: `@echo off\r\nsetlocal\r\nset "INIT_CWD=%CD%"\r\nnode "${p.entry}" %*\r\n` },
    { name: 'rauha', content: `#!/bin/sh\nINIT_CWD="$(pwd -W 2>/dev/null || pwd)" exec node "${forward}" "$@"\n`, mode: 0o755 },
  ];
  if (p.powershell) {
    files.push({
      name: 'rauha.ps1',
      // PowerShell에서 .cmd를 거치면 Ctrl+C 때 "일괄 작업을 끝내시겠습니까" 질문이 뜬다. ps1은 그런 질문이 없다.
      content: [
        '$previous = $env:INIT_CWD',
        '$env:INIT_CWD = $PWD.ProviderPath',
        `try { & node "${p.entry}" @args } finally { $env:INIT_CWD = $previous }`,
        'exit $LASTEXITCODE',
        '',
      ].join('\r\n'),
    });
  }
  return files;
}

/** Get-ExecutionPolicy 범위 순서(MachinePolicy, UserPolicy, CurrentUser, LocalMachine)의 값 → 실제 적용 정책. Process 범위는 이 창에만 해당해 뺀다. */
export function effectivePolicy(scopes: readonly string[]): string {
  return scopes.find((s) => s !== 'Undefined') ?? 'Restricted';
}

const SCRIPT_POLICIES = new Set(['RemoteSigned', 'Unrestricted', 'Bypass']);

function powershellAllowsScripts(): boolean {
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', "'MachinePolicy','UserPolicy','CurrentUser','LocalMachine' | ForEach-Object { Get-ExecutionPolicy -Scope $_ }"],
      { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
    );
    return SCRIPT_POLICIES.has(effectivePolicy(out.toString().split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '')));
  } catch {
    return false;
  }
}

export function runSetup(p: { entry: string; home: string; log: (line: string) => void }): number {
  const platform = process.platform;
  const { dir, onPath } = pickBinDir({ platform, pathEnv: process.env['PATH'] ?? process.env['Path'] ?? '', appData: process.env['APPDATA'] ?? null, home: p.home });
  const powershell = platform === 'win32' && powershellAllowsScripts();
  mkdirSync(dir, { recursive: true });
  for (const shim of shims({ platform, entry: p.entry, powershell })) {
    const file = join(dir, shim.name);
    writeFileSync(file, shim.content, 'utf8');
    if (shim.mode !== undefined) chmodSync(file, shim.mode);
    p.log(`  만들었어요: ${file}`);
  }
  if (!onPath) {
    p.log(`  이 폴더가 PATH에 없어요. PATH에 추가하면 어디서든 rauha를 부를 수 있어요: ${dir}`);
    return 1;
  }
  if (platform === 'win32' && !powershell) {
    p.log('  PowerShell이 스크립트 실행을 막고 있어 rauha.cmd로 실행돼요. 끝낼 때 "일괄 작업을 끝내시겠습니까" 질문이 뜰 수 있어요.');
    p.log('  없애려면 PowerShell에서 Set-ExecutionPolicy -Scope CurrentUser RemoteSigned 를 실행한 뒤 rauha setup을 한 번 더 하세요.');
  }
  p.log('  이제 아무 폴더에서나 rauha를 입력하면 돼요.');
  return 0;
}
