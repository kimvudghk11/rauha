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

  const here = { root: 'E:/work/app', secretFiles: ['.env', 'secrets/db.txt'] };

  it('셸 명령에 비밀 파일이 나오면 그 이름을 돌려준다', () => {
    expect(p.secretIn('cat .env | head', here)).toBe('.env');
    expect(p.secretIn('type "config\\.env.local"', here)).toBe('config\\.env.local');
    expect(p.secretIn('yarn test', here)).toBeNull();
  });

  it('와일드카드, 절대 경로, git show, 옵션 값으로 가리켜도 잡는다', () => {
    expect(p.secretIn('cat .env*', here)).toBe('.env*');
    expect(SecretPolicy.of(['secrets/**']).secretIn('cat E:\\work\\app\\secrets\\db.txt', here)).toBe('E:\\work\\app\\secrets\\db.txt');
    expect(p.secretIn('git show HEAD:.env', here)).toBe('HEAD:.env');
    expect(p.secretIn('node --env-file=.env server.js', here)).toBe('.env');
  });

  it('비밀 파일이 있는 저장소에서는 셸로 내용을 통째로 뒤지는 검색을 막는다', () => {
    expect(p.secretIn('grep -rn API_KEY .', here)).toBe('grep -rn');
    expect(p.secretIn('rg password', here)).toBe('rg');
    expect(p.secretIn('git grep token', here)).toBe('git grep');
    expect(p.secretIn('grep -rn API_KEY .', { ...here, secretFiles: [] })).toBeNull();
    expect(p.secretIn('grep -n foo src/a.ts', here)).toBeNull();
  });
});
