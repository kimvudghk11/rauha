import { describe, expect, it } from 'vitest';
import { SecretPolicy } from './secret-policy.js';

describe('SecretPolicy', () => {
  const p = SecretPolicy.defaults();

  it('기본 비밀 파일은 어느 폴더에 있어도 막는다', () => {
    for (const path of ['.env', 'apps/api/.env.production', 'certs/server.pem', 'keys/id_rsa', '.npmrc']) expect(p.isSecret(path)).toBe(true);
  });

  it('예시 파일은 비밀이 아니다', () => {
    for (const path of ['.env.example', 'config/.env.sample', '.env.template']) expect(p.isSecret(path)).toBe(false);
  });

  it('Windows 구분자와 대문자도 같은 파일로 본다', () => {
    expect(p.isSecret('config\\Prod.KEY')).toBe(true);
    expect(p.isSecret('.ENV')).toBe(true);
  });

  it('보통 소스 파일은 막지 않는다', () => {
    for (const path of ['src/env.ts', 'src/keyboard.ts', 'README.md']) expect(p.isSecret(path)).toBe(false);
  });

  it('추가 패턴은 경로째로도 맞춘다', () => {
    expect(SecretPolicy.of(['secrets/**']).isSecret('secrets/db/password.txt')).toBe(true);
  });

  it('셸 명령에 비밀 파일이 나오면 그 이름을 돌려준다', () => {
    expect(p.secretIn('cat .env | head')).toBe('.env');
    expect(p.secretIn('type "config\\.env.local"')).toBe('config\\.env.local');
    expect(p.secretIn('yarn test')).toBeNull();
  });
});
