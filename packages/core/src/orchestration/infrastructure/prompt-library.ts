import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DomainError } from '../../shared/domain-error.js';
import type { MemberRole } from '../application/dto/role-settings.dto.js';

const ROLES: readonly MemberRole[] = ['intake', 'tester', 'implementer'];

/**
 * 팀원 시스템 프롬프트. 실험하기 쉽도록 코드가 아니라 파일(`prompts/*.md`)에서 읽는다.
 * 해시는 실행 기록과 bench 표에 남겨 어떤 프롬프트 버전의 결과인지 구분한다.
 */
export class PromptLibrary {
  private constructor(
    private readonly prompts: Readonly<Record<MemberRole, string>>,
    readonly hash: string,
  ) {}

  /** 저장소의 기본 프롬프트 폴더. src와 dist가 같은 깊이라 둘 다에서 맞는다. */
  static defaultDir(): string {
    return fileURLToPath(new URL('../../../../../prompts/', import.meta.url));
  }

  static async load(dir: string): Promise<PromptLibrary> {
    const read = async (name: string) => {
      try {
        return (await readFile(join(dir, name), 'utf8')).trim();
      } catch {
        throw new DomainError('PROMPT_MISSING', `프롬프트 파일이 없습니다: ${join(dir, name)}`);
      }
    };
    const common = await read('_common.md');
    const entries = await Promise.all(ROLES.map(async (role) => [role, `${common}\n\n${await read(`${role}.md`)}`] as const));
    const prompts = Object.fromEntries(entries) as Record<MemberRole, string>;
    const hash = createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 8);
    return new PromptLibrary(prompts, hash);
  }

  system(role: MemberRole): string {
    return this.prompts[role];
  }
}
