import { readFile } from 'node:fs/promises';
import { parse } from 'smol-toml';
import { DomainError } from '../../shared/domain-error.js';
import { ProfileConfigDto } from '../application/dto/profile-config.dto.js';

/** `~/.rauha/config.toml`을 읽는다. 파일이 없으면 기본 프로필(personal / work)을 쓴다. */
export async function loadProfileConfig(path: string): Promise<ProfileConfigDto> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ProfileConfigDto.defaults();
    throw error;
  }
  try {
    return ProfileConfigDto.from(parse(text));
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('INVALID_CONFIG', `${path}: TOML을 읽지 못했습니다. ${(error as Error).message}`);
  }
}
