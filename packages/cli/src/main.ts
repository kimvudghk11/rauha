#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DomainError, loadProfileConfig, type MemberRole } from '@rauha/core';
import { parseArgs } from './args.js';
import { terminalAsker, terminalUser } from './ask.js';
import { runBench } from './bench.js';
import { LiveLine } from './live-line.js';
import { mascotView } from './mascot.js';
import { runOnce } from './run.js';

const VERSION = '0.0.0';

const HELP = `rauha — 터미널에서 팀장과 대화하는 클로드 팀

사용법
  rauha                       대화 모드 (아직 구현 전)
  rauha -p "<요청>"            한 번 실행: 접수 → 테스트 → 구현 → 검증 → 읽기 안내서
  rauha whoami                현재 프로필과 Claude Code 설정 폴더 확인
  rauha login                 이 프로필의 Claude Code 로그인 (브라우저 인증)
  rauha bench [--only <id>]   연습용 프로젝트에서 고정 요청 묶음 실행 (rauha 저장소 루트)
  rauha --profile <이름> ...   프로필 직접 지정 (기본: 폴더 규칙 → personal)

환경 변수
  RAUHA_CONFIG                설정 파일 경로 (기본 ~/.rauha/config.toml)
  RAUHA_PROMPTS_DIR           팀원 프롬프트 폴더 (기본: 저장소의 prompts/)
  RAUHA_ROLE_<ROLE>           역할별 모델·effort, 예: RAUHA_ROLE_IMPLEMENTER=sonnet:high
`;

/** `yarn rauha`는 패키지 폴더에서 실행되므로, 사용자가 명령을 친 폴더(INIT_CWD)를 쓴다. */
const workDir = process.env['INIT_CWD'] ?? process.cwd();
const log = (line: string) => process.stderr.write(`${line}\n`);

function gitRemote(cwd: string): string | null {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

async function resolveProfile(flag: string | null) {
  const configPath = process.env['RAUHA_CONFIG'] ?? join(homedir(), '.rauha', 'config.toml');
  const book = (await loadProfileConfig(configPath)).toEntity();
  return book.resolve({
    cwd: workDir,
    home: homedir(),
    gitRemote: gitRemote(workDir),
    flag,
    env: process.env['RAUHA_PROFILE'] ?? null,
  });
}

async function login(flag: string | null): Promise<number> {
  const { profile } = await resolveProfile(flag);
  const dir = profile.claudeConfigDir(homedir());
  mkdirSync(dir, { recursive: true });
  log(`${profile.badge()} Claude Code 로그인을 시작합니다. 설정 폴더: ${dir}`);
  return new Promise((resolve) => {
    const child = spawn('claude', ['auth', 'login'], {
      env: { ...process.env, ...profile.agentEnv(homedir()) },
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (error) => {
      log(`claude 실행 실패: ${error.message}. Claude Code가 설치돼 있는지 확인하세요.`);
      resolve(1);
    });
  });
}

async function run(argv: readonly string[]): Promise<number> {
  const command = parseArgs(argv);
  switch (command.kind) {
    case 'help':
      process.stdout.write(HELP);
      return 0;
    case 'version':
      process.stdout.write(`rauha ${VERSION}\n`);
      return 0;
    case 'whoami': {
      const { profile, source } = await resolveProfile(command.profile);
      process.stdout.write(
        `${profile.badge()} ${workDir}\n` +
          `  선택 근거: ${source}\n` +
          `  Claude Code 설정 폴더: ${profile.claudeConfigDir(homedir())}\n` +
          `  실행 기록: ${profile.runsDir(homedir())}\n` +
          `  기록 동기화: ${profile.canSync() ? '허용' : '안 함'}\n`,
      );
      return 0;
    }
    case 'login':
      return login(command.profile);
    case 'bench': {
      const { profile } = await resolveProfile(command.profile);
      const report = await runBench({ repoRoot: workDir, profile, home: homedir(), only: command.only, log });
      process.stdout.write(`${report}\n`);
      return 0;
    }
    case 'chat': {
      const { profile } = await resolveProfile(command.profile);
      if (command.prompt === null || command.prompt.trim() === '') {
        process.stdout.write(`${profile.badge()} 대화 모드는 아직 구현 전입니다. rauha -p "<요청>"을 쓰세요.\n`);
        return 0;
      }
      const view = process.stderr.isTTY ? mascotView(process.stderr.getColorDepth(), `v${VERSION}`, profile.badge()) : null;
      log(view ? view.banner(workDir, process.stderr.columns ?? 80) : `${profile.badge()} ${workDir}`);
      // 팀원이 일하는 동안 맨 아래 줄에 스피너와 경과 시간을 보여 준다. role이 붙은 알림 = 그 팀원이 일을 시작함.
      let working: MemberRole = 'intake';
      const live = view
        ? new LiveLine({
            write: (text) => process.stderr.write(text),
            now: Date.now,
            working: (frame, text, elapsed) => view.working(frame, text, working, elapsed),
            done: (text, elapsed) => view.done(text, working, elapsed),
          })
        : null;
      const say = (line: string) => (live ? live.print(line) : log(line));
      const step = (message: string, role?: MemberRole) => {
        if (view === null || live === null) return log(`${profile.badge()} ${message}`);
        live.stop();
        if (role === undefined) return say(view.step(message));
        working = role;
        live.start(message);
      };
      const { outcome } = await runOnce(command.prompt, {
        root: workDir,
        profile,
        home: homedir(),
        ask: terminalAsker({ view, live, log: say }),
        user: terminalUser(live),
        progress: { step },
        requireClean: true,
      }).finally(() => live?.stop());
      if (view) log(`\n${view.finale(outcome.status)}`);
      process.stdout.write(`\n${process.stdout.isTTY ? outcome.guide.toTerminal(workDir) : outcome.guide.toMarkdown()}\n`);
      return outcome.status === 'complete' ? 0 : 2;
    }
  }
}

run(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    if (error instanceof DomainError) {
      log(`rauha: ${error.message}`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  },
);
