import { describe, expect, it } from 'vitest';
import { ToolRisk } from './tool-risk.js';

const ROOT = 'E:/work/app';
const bash = (command: string) => ToolRisk.assess('Bash', { command }, ROOT).decision;
const write = (file_path: string) => ToolRisk.assess('Write', { file_path, content: 'x' }, ROOT).decision;

describe('ToolRisk', () => {
  it('git commit과 git push는 언제나 거절한다', () => {
    expect(bash('git commit -m "x"')).toBe('deny');
    expect(bash('npm test && git commit -am x')).toBe('deny');
    expect(bash('git push origin main')).toBe('deny');
    expect(bash('GIT_AUTHOR_NAME=a git commit -m x')).toBe('deny');
  });

  it('git 쓰기 명령은 묻는다', () => {
    for (const cmd of [
      'git reset --hard',
      'git checkout -- src/a.ts',
      'git restore .',
      'git clean -fd',
      'git stash',
      'git rebase main',
      'git branch -D old',
      'git rm src/a.ts',
    ]) {
      expect(bash(cmd), cmd).toBe('ask');
    }
  });

  it('git 읽기 명령은 허용한다', () => {
    for (const cmd of ['git status', 'git diff --stat', 'git log -3', 'git show HEAD', 'git branch']) {
      expect(bash(cmd), cmd).toBe('allow');
    }
  });

  it('파일 지우기는 묻는다', () => {
    for (const cmd of [
      'rm -rf dist',
      'cd src; rm a.ts',
      'rmdir old',
      'del /q a.txt',
      'Remove-Item -Recurse build',
      'find . -name "*.tmp" -delete',
      'ls | xargs rm',
    ]) {
      expect(bash(cmd), cmd).toBe('ask');
    }
  });

  it('전역 설치·배포·sudo는 묻는다', () => {
    for (const cmd of ['npm i -g typescript', 'npm install --global x', 'yarn global add x', 'pnpm add -g x', 'npm publish', 'yarn npm publish', 'sudo apt install x']) {
      expect(bash(cmd), cmd).toBe('ask');
    }
  });

  it('테스트·빌드·설치 명령은 허용한다', () => {
    for (const cmd of ['yarn test', 'npx vitest run src/a.spec.ts', 'npm install', 'yarn add -D vitest', 'tsc --noEmit', 'cat package.json | head -5']) {
      expect(bash(cmd), cmd).toBe('allow');
    }
  });

  it('폴더 밖 경로에 쓰는 Edit/Write는 묻는다', () => {
    expect(write('E:\\other\\a.ts')).toBe('ask');
    expect(write('../x.ts')).toBe('ask');
    expect(write('E:/work/app-other/a.ts')).toBe('ask');
    expect(write('E:\\work\\app\\src\\a.ts')).toBe('allow');
    expect(write('e:/work/app/src/a.ts')).toBe('allow');
    expect(write('src/a.ts')).toBe('allow');
    expect(ToolRisk.assess('Edit', { file_path: 'C:/x.ts' }, ROOT).decision).toBe('ask');
  });

  it('옵션·경로·하위 셸로 감싼 git commit도 거절한다', () => {
    for (const cmd of [
      'git -C . commit -m x',
      'git -C .. commit -am wip',
      'git -c user.name=a commit -m x',
      'git --git-dir=.git --work-tree=. commit -m x',
      'echo hi & git commit -m x',
      'bash -c "git commit -m x"',
      "sh -c 'git push'",
      '(git commit -m x)',
      'git.exe commit -m x',
      '/usr/bin/git commit -m x',
      'echo $(git commit -m x)',
      'cmd /c git commit -m x',
    ]) {
      expect(bash(cmd), cmd).toBe('deny');
    }
  });

  it('경로·하위 셸·find -exec로 감싼 지우기도 묻는다', () => {
    for (const cmd of ['/usr/bin/rm -rf x', 'find . -name a -exec rm {} ;', 'cmd /c rd /s /q build', 'powershell -Command "Remove-Item x"', 'rm.exe x']) {
      expect(bash(cmd), cmd).toBe('ask');
    }
  });

  it('읽기 도구와 웹 도구는 허용한다', () => {
    for (const tool of ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch']) {
      expect(ToolRisk.assess(tool, {}, ROOT).decision, tool).toBe('allow');
    }
  });

  it('묻거나 거절할 때는 이유를 붙인다', () => {
    expect(ToolRisk.assess('Bash', { command: 'rm -rf x' }, ROOT).reason).toMatch(/지우기/);
    expect(ToolRisk.assess('Bash', { command: 'yarn test' }, ROOT).reason).toBeNull();
  });
});
