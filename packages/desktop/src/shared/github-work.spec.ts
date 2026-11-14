import { describe, expect, it } from 'vitest';
import { commitsFromApi, ghLoginsOf, langsByShare, reposFromApi, ssoHint } from './github-work.js';

describe('gh 로그인 계정 읽기', () => {
  it('새 형식("account X")과 옛 형식("as X") 모두, 한 번씩', () => {
    const text = [
      'github.com',
      '  ✓ Logged in to github.com account kim-personal (keyring)',
      '  - Active account: true',
      '  ✓ Logged in to github.com account kim-corp (keyring)',
      '  - Active account: false',
      '✓ Logged in to github.com as old-user (oauth_token)',
      '  ✓ Logged in to github.com account kim-personal (keyring)',
    ].join('\n');
    expect(ghLoginsOf(text)).toEqual(['kim-personal', 'kim-corp', 'old-user']);
  });
  it('github.com 이 아닌 호스트·로그인 안 됨은 빼고, 이상한 이름은 버린다', () => {
    expect(ghLoginsOf('  ✓ Logged in to ghe.corp.com account x (keyring)\nYou are not logged into any GitHub hosts.')).toEqual([]);
    expect(ghLoginsOf('  ✓ Logged in to github.com account a;rm (keyring)')).toEqual([]);
  });
});

describe('GitHub API 응답 읽기(믿지 않고 거른다)', () => {
  it('레포 목록: 이름·기본 브랜치·마지막 푸시, 보관된 레포는 빼고 최근 푸시 순', () => {
    const r = reposFromApi([
      { full_name: 'kim/a', default_branch: 'main', pushed_at: '2026-01-01T00:00:00Z', archived: false, fork: false, private: true },
      { full_name: 'kim/b', default_branch: 'dev', pushed_at: '2026-06-01T00:00:00Z', archived: false, fork: true, private: false },
      { full_name: 'kim/old', default_branch: 'main', pushed_at: '2020-01-01T00:00:00Z', archived: true },
      { full_name: '../evil', default_branch: 'main' },
      'junk',
    ]);
    expect(r.map((x) => x.fullName)).toEqual(['kim/b', 'kim/a']);
    expect(r[0]).toMatchObject({ defaultBranch: 'dev', fork: true });
  });
  it('커밋: 해시·제목(첫 줄)·시각, 작성자는 github:<로그인>, 병합 커밋은 뺀다', () => {
    const c = commitsFromApi(
      [
        { sha: 'a1b2c3d4', commit: { message: 'feat: 결제 재시도\n\n본문', author: { date: '2026-05-01T00:00:00Z', name: 'Kim' } }, parents: [{}] },
        { sha: 'e5f6a7b8', commit: { message: 'Merge pull request #3', author: { date: '2026-05-02T00:00:00Z' } }, parents: [{}, {}] },
        { nope: true },
      ],
      'corp/pay',
      'Kim-Corp',
    );
    expect(c).toEqual([{ repo: 'corp/pay', hash: 'a1b2c3d4', name: 'Kim', email: 'github:kim-corp', at: Date.parse('2026-05-01T00:00:00Z') / 1000, subject: 'feat: 결제 재시도', added: 0, removed: 0, files: 0, langs: {} }]);
  });
  it('레포 언어 바이트 → 비중(100 단위, 1% 미만은 버림)', () => {
    expect(langsByShare({ Kotlin: 7000, Java: 2500, Shell: 500, Dockerfile: 10 })).toEqual({ Kotlin: 70, Java: 25, Shell: 5 });
    expect(langsByShare(null)).toEqual({});
  });
  it('조직 SSO 로 막히면 쉬운 안내(어느 조직인지)', () => {
    expect(ssoHint(403, 'Resource protected by organization SAML enforcement. You must grant your OAuth token access to this organization.', 'corp/pay')).toMatch(/gh auth refresh.*corp/);
    expect(ssoHint(404, 'Not Found', 'corp/pay')).toBeNull();
  });
});
