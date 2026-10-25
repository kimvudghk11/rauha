import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadProfileConfig } from './config-file.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('loadProfileConfig', () => {
  it('설정 파일이 없으면 기본 프로필을 쓴다', async () => {
    const book = (await loadProfileConfig(join(tmpdir(), 'no-such-rauha.toml'))).toEntity();
    expect(book.names()).toEqual(['personal', 'work']);
  });

  it('TOML 설정 파일을 읽는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rauha-cfg-'));
    dirs.push(dir);
    const file = join(dir, 'config.toml');
    writeFileSync(
      file,
      ['[profiles.personal]', 'claude_config_dir = "~/.claude"', 'sync = "none"', '', '[[match]]', 'path = "~/work/**"', 'profile = "personal"'].join('\n'),
    );
    const book = (await loadProfileConfig(file)).toEntity();
    expect(book.names()).toEqual(['personal']);
  });
});
