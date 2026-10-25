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

function isAbsolute(path: string): boolean {
  return path.startsWith('/') || WINDOWS_DRIVE.test(path);
}

/** `.` 과 `..` 를 접어서 정규화한다. 루트 위로 올라가는 `..` 는 그대로 남긴다. */
function normalizeSegments(path: string): string {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') {
      if (out.length === 0 && part === '') out.push('');
      continue;
    }
    if (part === '..' && out.length > 0 && out[out.length - 1] !== '..' && out[out.length - 1] !== '') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}

/**
 * root 기준 상대 경로. root 밖이면 null.
 * 상대 경로는 root 기준으로 보고, Windows 드라이브 경로는 대소문자를 무시한다.
 */
export function relativeToRoot(root: string, path: string): string | null {
  const base = normalizeSegments(toPosixPath(root));
  const posix = toPosixPath(path);
  const full = normalizeSegments(isAbsolute(posix) ? posix : `${base}/${posix}`);
  const fold = (s: string) => (WINDOWS_DRIVE.test(base) ? s.toLowerCase() : s);
  if (fold(full) === fold(base)) return '';
  if (!fold(full).startsWith(`${fold(base)}/`)) return null;
  return full.slice(base.length + 1);
}

export function isInsideRoot(root: string, path: string): boolean {
  return relativeToRoot(root, path) !== null;
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
