/**
 * 경로와 Git 원격 주소를 같은 규칙으로 비교하기 위한 작은 도우미.
 * Windows 경로(E:\work\app)도 E:/work/app 으로 바꿔서 비교한다.
 */

const WINDOWS_DRIVE = /^[a-zA-Z]:\//;

export function toPosixPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function expandHome(path: string, home: string): string {
  if (path === '~') return toPosixPath(home);
  if (path.startsWith('~/') || path.startsWith('~\\')) {
    return `${toPosixPath(home)}/${toPosixPath(path.slice(2))}`;
  }
  return toPosixPath(path);
}

/** `git@github.com:org/repo.git`, `https://github.com/org/repo.git` → `github.com/org/repo` */
export function normalizeGitRemote(remote: string): string {
  return remote
    .trim()
    .replace(/^[a-z+]+:\/\//i, '')
    .replace(/^[^@/]+@/, '')
    .replace(/^([^/:]+):(?!\d)/, '$1/')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
}

/**
 * `*` 는 한 단계, `**` 는 여러 단계와 일치한다. `dir/**` 는 dir 자체와도 일치한다.
 */
export function matchesPattern(pattern: string, value: string): boolean {
  const source = pattern
    .split(/(\/\*\*|\*\*|\*)/)
    .map((part) => {
      if (part === '/**') return '(?:/.*)?';
      if (part === '**') return '.*';
      if (part === '*') return '[^/]*';
      return part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  const caseInsensitive = WINDOWS_DRIVE.test(pattern) || WINDOWS_DRIVE.test(value);
  return new RegExp(`^${source}$`, caseInsensitive ? 'i' : '').test(value);
}
