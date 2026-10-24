import { DomainError } from '../../../shared/domain-error.js';
import { asRecord, readOptionalString, readString } from '../../../shared/validation.js';
import { MatchRule } from '../../domain/match-rule.js';
import { Profile, type SyncTarget } from '../../domain/profile.js';
import { ProfileBook } from '../../domain/profile-book.js';

interface ProfileEntry {
  readonly name: string;
  readonly claudeConfigDir: string;
  readonly sync: SyncTarget;
}

interface RuleEntry {
  readonly path: string | null;
  readonly gitRemote: string | null;
  readonly profile: string;
}

/**
 * ~/.rauha/config.toml 을 읽은 결과(파싱된 객체)를 받는 DTO.
 * 키 이름은 설정 파일의 snake_case 를 그대로 받는다.
 */
export class ProfileConfigDto {
  private constructor(
    readonly profiles: readonly ProfileEntry[],
    readonly rules: readonly RuleEntry[],
    readonly defaultProfile: string,
  ) {}

  /** 설정 파일이 없을 때 쓰는 기본값: personal / work 두 프로필, 규칙 없음. */
  static defaults(): ProfileConfigDto {
    return new ProfileConfigDto(
      [
        { name: 'personal', claudeConfigDir: '~/.rauha/profiles/personal/claude', sync: 'aws' },
        { name: 'work', claudeConfigDir: '~/.rauha/profiles/work/claude', sync: 'none' },
      ],
      [],
      'personal',
    );
  }

  static from(input: unknown): ProfileConfigDto {
    const obj = asRecord(input, 'config');
    const profilesObj = asRecord(obj['profiles'] ?? {}, 'config.profiles');

    const profiles = Object.entries(profilesObj).map(([name, raw]): ProfileEntry => {
      const p = asRecord(raw, `config.profiles.${name}`);
      const sync = p['sync'] ?? 'none';
      if (sync !== 'aws' && sync !== 'none') {
        throw new DomainError('INVALID_INPUT', `config.profiles.${name}.sync: "aws" 또는 "none"이어야 합니다.`);
      }
      return {
        name,
        claudeConfigDir: readString(p, 'claude_config_dir', `config.profiles.${name}`),
        sync,
      };
    });

    const rawRules = obj['match'] ?? [];
    if (!Array.isArray(rawRules)) {
      throw new DomainError('INVALID_INPUT', 'config.match: 배열([[match]])이어야 합니다.');
    }
    const rules = rawRules.map((raw, i): RuleEntry => {
      const r = asRecord(raw, `config.match[${i}]`);
      const path = readOptionalString(r, 'path', `config.match[${i}]`);
      const gitRemote = readOptionalString(r, 'git_remote', `config.match[${i}]`);
      if ((path === null) === (gitRemote === null)) {
        throw new DomainError('INVALID_INPUT', `config.match[${i}]: path와 git_remote 중 하나만 지정해야 합니다.`);
      }
      return { path, gitRemote, profile: readString(r, 'profile', `config.match[${i}]`) };
    });

    const defaultProfile = readOptionalString(obj, 'default_profile', 'config') ?? 'personal';
    return new ProfileConfigDto(profiles, rules, defaultProfile);
  }

  toEntity(): ProfileBook {
    return ProfileBook.create({
      profiles: this.profiles.map((p) => Profile.create(p)),
      rules: this.rules.map((r) =>
        r.path !== null ? MatchRule.path(r.path, r.profile) : MatchRule.gitRemote(r.gitRemote as string, r.profile),
      ),
      defaultProfile: this.defaultProfile,
    });
  }
}
