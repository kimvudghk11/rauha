import { DomainError } from '../../shared/domain-error.js';
import type { MatchRule, WorkspaceContext } from './match-rule.js';
import type { Profile } from './profile.js';

export type ResolutionSource = 'flag' | 'env' | 'match' | 'default';

export interface ProfileRequest extends WorkspaceContext {
  /** --profile 옵션 */
  readonly flag: string | null;
  /** RAUHA_PROFILE 환경 변수 */
  readonly env: string | null;
}

export interface Resolution {
  readonly profile: Profile;
  readonly source: ResolutionSource;
}

/**
 * 프로필 목록과 규칙을 묶은 애그리거트.
 * 순서: --profile → RAUHA_PROFILE → 폴더·Git 규칙 → 기본값.
 * 규칙이 정한 프로필과 다른 프로필을 명시하면 막는다(회사 코드를 개인 계정으로 보내지 않기).
 */
export class ProfileBook {
  private constructor(
    private readonly profiles: ReadonlyMap<string, Profile>,
    private readonly rules: readonly MatchRule[],
    private readonly defaultName: string,
  ) {}

  static create(props: { profiles: readonly Profile[]; rules: readonly MatchRule[]; defaultProfile: string }): ProfileBook {
    const map = new Map<string, Profile>();
    for (const profile of props.profiles) {
      if (map.has(profile.name)) {
        throw new DomainError('DUPLICATE_PROFILE', `프로필 ${profile.name}이 두 번 정의됐습니다.`);
      }
      map.set(profile.name, profile);
    }
    const book = new ProfileBook(map, [...props.rules], props.defaultProfile);
    book.require(props.defaultProfile);
    for (const rule of props.rules) book.require(rule.profile);
    return book;
  }

  resolve(request: ProfileRequest): Resolution {
    const ruled = this.rules.find((rule) => rule.matches(request))?.profile ?? null;
    const explicit = request.flag ?? request.env;

    if (explicit !== null) {
      if (ruled !== null && ruled !== explicit) {
        throw new DomainError(
          'PROFILE_MISMATCH',
          `이 폴더는 ${ruled} 프로필 전용입니다. ${explicit} 프로필로는 실행할 수 없습니다.`,
        );
      }
      return { profile: this.require(explicit), source: request.flag !== null ? 'flag' : 'env' };
    }
    if (ruled !== null) return { profile: this.require(ruled), source: 'match' };
    return { profile: this.require(this.defaultName), source: 'default' };
  }

  names(): string[] {
    return [...this.profiles.keys()];
  }

  private require(name: string): Profile {
    const profile = this.profiles.get(name);
    if (!profile) throw new DomainError('UNKNOWN_PROFILE', `정의되지 않은 프로필입니다: ${name}`);
    return profile;
  }
}
