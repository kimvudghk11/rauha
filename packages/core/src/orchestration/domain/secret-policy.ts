import { matchesPattern } from '../../shared/path-pattern.js';

/** 언제나 막는 비밀 파일. `/`가 없는 패턴은 파일 이름에 맞춘다. */
const DEFAULT_PATTERNS: readonly string[] = [
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  '*.keystore',
  'id_rsa*',
  'id_ed25519*',
  '.npmrc',
  '.pypirc',
  'credentials.json',
];

/** 설정 방법을 알려 주는 예시 파일은 기본 목록에서 뺀다(`.env.example` 등). */
const EXAMPLE_SUFFIXES = ['.example', '.sample', '.template'];

/** 셸 명령을 단어로 나누는 경계. 따옴표·파이프·리다이렉트는 모두 경계다. */
const COMMAND_BOUNDARY = /[\s"'|;&<>()`]+/;

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

/**
 * 팀원과 rauha가 읽지도 쓰지도 않는 비밀 파일 규칙. 기본 목록에 저장소의 `.rauhaignore` 패턴을 더한다.
 * 경로는 저장소 기준 상대 경로로 받고, Windows 구분자와 대소문자 차이는 같은 파일로 본다.
 */
export class SecretPolicy {
  private constructor(private readonly extra: readonly string[]) {}

  static defaults(): SecretPolicy {
    return new SecretPolicy([]);
  }

  static of(extraPatterns: readonly string[]): SecretPolicy {
    return new SecretPolicy(extraPatterns.map((p) => normalize(p)));
  }

  isSecret(relPath: string): boolean {
    const path = normalize(relPath);
    const name = path.split('/').pop() ?? path;
    const example = EXAMPLE_SUFFIXES.some((suffix) => name.endsWith(suffix));
    return (!example && DEFAULT_PATTERNS.some((p) => matches(p, path, name))) || this.extra.some((p) => matches(p, path, name));
  }

  /** 명령에 나오는 첫 비밀 파일 이름(명령에 쓰인 그대로). 없으면 null. */
  secretIn(command: string): string | null {
    return command.split(COMMAND_BOUNDARY).find((word) => word !== '' && this.isSecret(word)) ?? null;
  }
}

function matches(pattern: string, path: string, name: string): boolean {
  return pattern.includes('/') ? matchesPattern(pattern, path) : matchesPattern(pattern, name);
}
