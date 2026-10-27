import { DomainError } from '../../shared/domain-error.js';
import { expandHome, toPosixPath } from '../../shared/path-pattern.js';

export type SyncTarget = 'aws' | 'none';

const NAME = /^[a-z][a-z0-9-]{0,31}$/;

/** 계정 하나. Claude Code 설정 폴더가 곧 그 계정의 로그인이다. */
export class Profile {
  private constructor(
    readonly name: string,
    private readonly claudeConfigDirRaw: string,
    readonly sync: SyncTarget,
  ) {}

  static create(props: { name: string; claudeConfigDir: string; sync: SyncTarget }): Profile {
    if (!NAME.test(props.name)) {
      throw new DomainError('INVALID_PROFILE_NAME', `프로필 이름이 올바르지 않습니다: ${props.name}`);
    }
    if (props.claudeConfigDir.trim() === '') {
      throw new DomainError('EMPTY_CONFIG_DIR', `${props.name} 프로필의 claude_config_dir가 비어 있습니다.`);
    }
    return new Profile(props.name, props.claudeConfigDir.trim(), props.sync);
  }

  claudeConfigDir(home: string): string {
    return expandHome(this.claudeConfigDirRaw, home);
  }

  /** Agent SDK(Claude Code)를 띄울 때 넘길 환경 변수. 토큰은 rauha가 직접 다루지 않는다. */
  agentEnv(home: string): Record<string, string> {
    return { CLAUDE_CONFIG_DIR: this.claudeConfigDir(home) };
  }

  /** 실행 기록 폴더. work 프로필 기록이 PC 밖으로 나가지 않도록 프로필 폴더 아래에 둔다. */
  runsDir(home: string): string {
    return `${toPosixPath(home)}/.rauha/profiles/${this.name}/runs`;
  }

  /** 기억 그래프 폴더. 실행 기록처럼 프로필 폴더 아래에 두어 work 기억이 섞이거나 밖으로 나가지 않게 한다. */
  memoryDir(home: string): string {
    return `${toPosixPath(home)}/.rauha/profiles/${this.name}/memory`;
  }

  /** 저장소 지식 폴더. 회사 저장소의 요약이 다른 프로필과 섞이지 않게 프로필 폴더 아래에 둔다. */
  knowledgeDir(home: string): string {
    return `${toPosixPath(home)}/.rauha/profiles/${this.name}/knowledge`;
  }

  /** 이어 갈 대화(rauha --continue) 폴더. 대화 내용이 섞이거나 밖으로 나가지 않게 프로필 폴더 아래에 둔다. */
  sessionsDir(home: string): string {
    return `${toPosixPath(home)}/.rauha/profiles/${this.name}/sessions`;
  }

  canSync(): boolean {
    return this.sync !== 'none';
  }

  badge(): string {
    return `[${this.name}]`;
  }
}
