import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PromptLibrary } from './prompt-library.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function folder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rauha-prompts-'));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

describe('PromptLibrary', () => {
  it('공통 앞부분과 역할 프롬프트를 이어 붙인다', async () => {
    const lib = await PromptLibrary.load(folder({ '_common.md': 'COMMON', 'intake.md': 'I', 'tester.md': 'T', 'implementer.md': 'M', 'reviewer.md': 'R' }));
    expect(lib.system('tester')).toBe('COMMON\n\nT');
    expect(lib.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('프롬프트가 바뀌면 해시도 바뀐다', async () => {
    const a = await PromptLibrary.load(folder({ '_common.md': 'C', 'intake.md': 'I', 'tester.md': 'T', 'implementer.md': 'M', 'reviewer.md': 'R' }));
    const b = await PromptLibrary.load(folder({ '_common.md': 'C', 'intake.md': 'I', 'tester.md': 'T2', 'implementer.md': 'M', 'reviewer.md': 'R' }));
    expect(a.hash).not.toBe(b.hash);
  });

  it('리뷰어 프롬프트도 공통 원칙과 합쳐 읽는다', async () => {
    const lib = await PromptLibrary.load(folder({ '_common.md': 'C', 'intake.md': 'I', 'tester.md': 'T', 'implementer.md': 'M', 'reviewer.md': 'R' }));
    expect(lib.system('reviewer')).toBe('C\n\nR');
  });

  it('역할 프롬프트가 없으면 알려 준다', async () => {
    await expect(PromptLibrary.load(folder({ '_common.md': 'C' }))).rejects.toThrow(/intake\.md/);
  });

  it('저장소의 기본 프롬프트를 읽을 수 있다', async () => {
    const lib = await PromptLibrary.load(PromptLibrary.defaultDir());
    expect(lib.system('implementer')).toContain('<role>');
  });
});
