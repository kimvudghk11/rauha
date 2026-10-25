import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/** 외부 명령을 실행하고 끝날 때까지 기다린다. 실패해도 던지지 않고 종료 코드로 알린다. */
export type Exec = (command: string, args: readonly string[], cwd: string) => Promise<{ code: number; stdout: string; stderr: string }>;

export interface UpdateResult {
  /** false면 갱신하다 실패했다. 이때는 다시 띄우지 않는다. */
  readonly ok: boolean;
  /** 내려받은 새 커밋 수(내려받지 않았으면 0) */
  readonly pulled: number;
  readonly installed: boolean;
  readonly built: boolean;
}

/** 이 파일들이 바뀌면 의존성을 다시 설치한다. */
const INSTALL_TRIGGERS = ['package.json', 'yarn.lock', '.yarnrc.yml'];

/** 오류 출력에서 보여 줄 마지막 줄 수 */
const ERROR_TAIL_LINES = 6;

const tail = (text: string) => text.trim().split('\n').slice(-ERROR_TAIL_LINES).join('\n');

/** rauha 저장소 루트. 빌드된 dist/update.js와 src/update.ts 모두 packages/cli/{dist,src}라 세 단계 위다. */
export function repoRoot(): string {
  return fileURLToPath(new URL('../../../', import.meta.url));
}

/** rauha 저장소에서 실행 중인지. 그렇지 않으면(다른 곳에 설치됨) 갱신할 수 없다. */
export function isRauhaRepo(readRootPackage: () => string = () => readFileSync(join(repoRoot(), 'package.json'), 'utf8')): boolean {
  try {
    return (JSON.parse(readRootPackage()) as { name?: unknown }).name === 'rauha-monorepo';
  } catch {
    return false;
  }
}

/**
 * 최신 버전으로 갱신한다: 새 커밋 내려받기(빨리감기만) → 의존성이 바뀌었으면 설치 → 빌드.
 * - 작업 중인 파일(추적 중인 파일의 변경)이 있으면 내려받지 않는다. 덮어쓰거나 합치지 않는다.
 * - 새 커밋을 내려받았을 때만 빌드한다(`built`). 이미 최신이거나 내려받지 못했으면 바뀐 게 없으니 다시 띄울 필요도 없다.
 * - 설치나 빌드가 실패하면 실패로 끝낸다. 깨진 빌드로 다시 띄우지 않게.
 */
export async function runUpdate(root: string, exec: Exec, log: (line: string) => void): Promise<UpdateResult> {
  let pulled = 0;
  let installed = false;

  const inRepo = (await exec('git', ['rev-parse', '--is-inside-work-tree'], root)).code === 0;
  if (inRepo) {
    const fetched = await exec('git', ['fetch', '--quiet'], root);
    if (fetched.code !== 0) {
      log('  GitHub에 연결하지 못해 새 커밋을 확인하지 못했어요.');
    } else {
      const behind = Number((await exec('git', ['rev-list', '--count', 'HEAD..@{u}'], root)).stdout.trim()) || 0;
      const dirty = (await exec('git', ['status', '--porcelain', '--untracked-files=no'], root)).stdout.trim() !== '';
      if (behind === 0) {
        log('  이미 최신 커밋이에요.');
      } else if (dirty) {
        log(`  새 커밋 ${behind}개가 있지만 바뀐 파일이 있어 내려받지 않았어요. 커밋하거나 되돌린 뒤 다시 해 주세요.`);
      } else {
        const before = (await exec('git', ['rev-parse', 'HEAD'], root)).stdout.trim();
        const pull = await exec('git', ['pull', '--ff-only'], root);
        if (pull.code !== 0) {
          log(`  새 커밋을 내려받지 못했어요(합쳐야 하는 변경이 있을 수 있어요).\n${tail(pull.stderr || pull.stdout)}`);
        } else {
          pulled = behind;
          log(`  새 커밋 ${behind}개를 내려받았어요.`);
          const after = (await exec('git', ['rev-parse', 'HEAD'], root)).stdout.trim();
          const changed = (await exec('git', ['diff', '--name-only', before, after], root)).stdout.split('\n').map((l) => l.trim());
          if (changed.some((file) => INSTALL_TRIGGERS.includes(file))) {
            log('  의존성이 바뀌어서 설치할게요.');
            const install = await exec('yarn', ['install'], root);
            if (install.code !== 0) {
              log(`  설치에 실패했어요.\n${tail(install.stderr || install.stdout)}`);
              return { ok: false, pulled, installed: false, built: false };
            }
            installed = true;
          }
        }
      }
    }
  }

  if (pulled === 0) return { ok: true, pulled, installed, built: false };

  log('  빌드하는 중이에요…');
  const build = await exec('yarn', ['build'], root);
  if (build.code !== 0) {
    log(`  빌드에 실패했어요. 다시 띄우지 않았어요.\n${tail(build.stdout || build.stderr)}`);
    return { ok: false, pulled, installed, built: false };
  }
  log('  빌드를 마쳤어요.');
  return { ok: true, pulled, installed, built: true };
}

/** 실제 실행기. Windows에서 yarn은 .cmd라 셸을 거치게 한다(명령과 인자는 코드에 박힌 고정 값뿐이다). */
export function nodeExec(spawn: typeof nodeSpawn = nodeSpawn, platform: string = process.platform): Exec {
  return (command, args, cwd) =>
    new Promise((resolve) => {
      try {
        const child = spawn(command, [...args], { cwd, shell: platform === 'win32', windowsHide: true } satisfies SpawnOptions);
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
        child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
        child.on('error', (error) => resolve({ code: 1, stdout, stderr: stderr || error.message }));
        child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
      } catch (error) {
        resolve({ code: 1, stdout: '', stderr: (error as Error).message });
      }
    });
}

type Spawn = (command: string, args: readonly string[], options: SpawnOptions) => { on(event: 'exit', listener: (code: number | null) => void): unknown; on(event: 'error', listener: () => void): unknown };

/**
 * 같은 node·같은 실행 파일·같은 인자로 rauha를 다시 띄우고 터미널(입출력)을 넘겨준다. 끝나면 그 종료 코드를 돌려준다.
 * Node에는 프로세스를 통째로 바꾸는 exec가 없어서, 새 프로세스가 끝날 때까지 이 프로세스는 기다린다.
 */
export function relaunch(spawn: Spawn, nodePath: string, nodeArgs: readonly string[], entry: string, args: readonly string[]): Promise<number> {
  return new Promise((resolve) => {
    try {
      const child = spawn(nodePath, [...nodeArgs, entry, ...args], { stdio: 'inherit' });
      child.on('error', () => resolve(1));
      child.on('exit', (code) => resolve(code ?? 1));
    } catch {
      resolve(1);
    }
  });
}
