import { relativeToRoot } from '../../shared/path-pattern.js';

export type ToolDecision = 'allow' | 'ask' | 'deny';

export interface ToolVerdict {
  readonly decision: ToolDecision;
  readonly reason: string | null;
}

const WRITE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit']);

/** rauha는 커밋하지 않는다. 커밋은 언제나 사용자가 직접 한다. */
const GIT_ALWAYS_DENY = new Set(['commit', 'push']);
const GIT_WRITES = new Set([
  'reset', 'checkout', 'restore', 'switch', 'clean', 'stash', 'rebase', 'merge', 'cherry-pick',
  'revert', 'tag', 'rm', 'mv', 'am', 'apply', 'update-ref', 'filter-branch', 'gc', 'prune',
]);
const DELETE_COMMANDS = new Set(['rm', 'rmdir', 'del', 'erase', 'rd', 'unlink', 'shred', 'remove-item', 'ri']);
const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);

const ALLOW: ToolVerdict = { decision: 'allow', reason: null };
const ask = (reason: string): ToolVerdict => ({ decision: 'ask', reason });
const deny = (reason: string): ToolVerdict => ({ decision: 'deny', reason });

/** 다른 명령을 인자로 받아 실행하는 프로그램. 뒤따르는 단어들을 하나의 명령으로 다시 검사한다. */
const WRAPPERS = new Set(['bash', 'sh', 'zsh', 'cmd', 'powershell', 'pwsh', 'env', 'xargs', 'nohup', 'time', 'npx', 'exec', 'eval']);
/** 값을 하나 받는 git 전역 옵션. 하위 명령을 찾을 때 그 값까지 건너뛴다. */
const GIT_VALUE_OPTIONS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env']);

/**
 * `a && b; c | d & e` → 조각마다 단어 목록. 괄호·`$(…)`·백틱은 경계로, 따옴표는 공백으로 본다.
 * 따옴표 안의 명령(`bash -c "git commit"`)도 같은 규칙으로 검사하기 위해서다.
 */
function segments(command: string): string[][] {
  return command
    .replace(/\$\(|[()`]/g, ' ; ')
    .replace(/["']/g, ' ')
    .split(/&&|\|\||;|\||&|\n/)
    .map((part) => part.trim().split(/\s+/).filter((word) => word !== ''))
    .map((words) => {
      let i = 0;
      while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i] as string)) i += 1;
      return words.slice(i);
    })
    .filter((words) => words.length > 0);
}

/** `/usr/bin/git.exe` → `git` */
function programName(word: string): string {
  return (word.split(/[\\/]/).pop() as string).toLowerCase().replace(/\.(exe|cmd|bat)$/, '');
}

function gitSubcommand(args: readonly string[]): string | undefined {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (GIT_VALUE_OPTIONS.has(arg)) {
      i += 1;
      continue;
    }
    if (!arg.startsWith('-')) return arg;
  }
  return undefined;
}

function worst(verdicts: readonly ToolVerdict[]): ToolVerdict {
  return verdicts.reduce((acc, next) => (RANK[next.decision] > RANK[acc.decision] ? next : acc), ALLOW);
}

function assessSegment(words: readonly string[]): ToolVerdict {
  const program = programName(words[0] as string);
  const args = words.slice(1);

  // 감싸는 프로그램(bash -c, cmd /c, xargs …)은 옵션을 건너뛰고 나머지를 명령으로 다시 본다.
  if (WRAPPERS.has(program)) {
    const rest = args.filter((a) => !/^[-/][A-Za-z]+$/.test(a));
    return rest.length > 0 ? assessSegment(rest) : ALLOW;
  }
  if (program === 'sudo') return ask('sudo 실행');
  if (DELETE_COMMANDS.has(program)) return ask(`파일 지우기 (${program})`);
  if (program === 'find') {
    if (args.includes('-delete')) return ask('파일 지우기 (find -delete)');
    const exec = args.findIndex((a) => a === '-exec' || a === '-execdir');
    if (exec >= 0 && args[exec + 1] !== undefined) return worst([assessSegment(args.slice(exec + 1))]);
  }

  if (program === 'git') {
    const sub = gitSubcommand(args);
    if (sub === undefined) return ALLOW;
    if (GIT_ALWAYS_DENY.has(sub)) return deny(`git ${sub}: 커밋과 push는 사용자가 직접 합니다`);
    if (GIT_WRITES.has(sub)) return ask(`git 쓰기 (git ${sub})`);
    if (sub === 'branch' && args.some((a) => /^-(d|D|-delete)$/.test(a))) return ask('git 쓰기 (브랜치 삭제)');
    return ALLOW;
  }

  if (PACKAGE_MANAGERS.has(program)) {
    if (args.includes('publish')) return ask(`배포 (${program} publish)`);
    if (args.includes('-g') || args.includes('--global') || args[0] === 'global') return ask(`전역 설치 (${program})`);
  }
  return ALLOW;
}

const RANK: Readonly<Record<ToolDecision, number>> = { allow: 0, ask: 1, deny: 2 };

/**
 * 팀원의 도구 호출 위험도. 기본은 허용하고, 정말 위험한 동작만 묻는다.
 * 역할별 쓰기 권한(WritePolicy)은 이것과 별개로 검사한다.
 */
export class ToolRisk {
  private constructor() {}

  static assess(tool: string, input: Record<string, unknown>, root: string): ToolVerdict {
    if (WRITE_TOOLS.has(tool)) {
      const path = input['file_path'] ?? input['notebook_path'];
      if (typeof path === 'string' && relativeToRoot(root, path) === null) {
        return ask(`작업 폴더 밖에 쓰기 (${path})`);
      }
      return ALLOW;
    }
    if (tool === 'Bash' || tool === 'PowerShell') {
      const command = input['command'];
      if (typeof command !== 'string') return ALLOW;
      return worst(segments(command).map(assessSegment));
    }
    return ALLOW;
  }
}
