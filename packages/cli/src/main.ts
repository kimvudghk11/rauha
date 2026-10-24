#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { DomainError, ProfileConfigDto } from '@rauha/core';
import { parseArgs } from './args.js';

const VERSION = '0.0.0';

const HELP = `rauha — 터미널에서 팀장과 대화하는 클로드 팀

사용법
  rauha                       대화 모드 (현재 폴더가 작업 범위)
  rauha -p "<요청>"            한 번 실행하고 결과만 출력
  rauha whoami                현재 프로필과 Claude Code 설정 폴더 확인
  rauha --profile <이름> ...   프로필 직접 지정 (기본: 폴더 규칙 → personal)
`;

function gitRemote(cwd: string): string | null {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function resolveProfile(flag: string | null) {
  // TODO: ~/.rauha/config.toml 읽기. 지금은 기본 프로필(personal / work)만 쓴다.
  const book = ProfileConfigDto.defaults().toEntity();
  const cwd = process.cwd();
  return book.resolve({
    cwd,
    home: homedir(),
    gitRemote: gitRemote(cwd),
    flag,
    env: process.env['RAUHA_PROFILE'] ?? null,
  });
}

function run(argv: readonly string[]): number {
  const command = parseArgs(argv);
  switch (command.kind) {
    case 'help':
      process.stdout.write(HELP);
      return 0;
    case 'version':
      process.stdout.write(`rauha ${VERSION}\n`);
      return 0;
    case 'whoami': {
      const { profile, source } = resolveProfile(command.profile);
      process.stdout.write(
        `${profile.badge()} ${process.cwd()}\n` +
          `  선택 근거: ${source}\n` +
          `  Claude Code 설정 폴더: ${profile.claudeConfigDir(homedir())}\n` +
          `  기록 동기화: ${profile.canSync() ? '허용' : '안 함'}\n`,
      );
      return 0;
    }
    case 'chat': {
      const { profile } = resolveProfile(command.profile);
      process.stdout.write(`${profile.badge()} 대화 모드는 아직 구현 전입니다. (설계서의 구현 순서 1단계)\n`);
      return 0;
    }
  }
}

try {
  process.exitCode = run(process.argv.slice(2));
} catch (error) {
  if (error instanceof DomainError) {
    process.stderr.write(`rauha: ${error.message}\n`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
