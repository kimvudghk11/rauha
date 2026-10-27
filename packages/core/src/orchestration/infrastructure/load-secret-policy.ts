import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RauhaIgnoreDto } from '../application/dto/rauha-ignore.dto.js';
import type { SecretPolicy } from '../domain/secret-policy.js';

/** 작업 폴더의 `.rauhaignore`를 읽어 비밀 파일 규칙을 만든다. 파일이 없으면 기본 목록만. */
export function loadSecretPolicy(root: string): SecretPolicy {
  let text: string | null = null;
  try {
    text = readFileSync(join(root, '.rauhaignore'), 'utf8');
  } catch {
    text = null;
  }
  return RauhaIgnoreDto.from(text).toEntity();
}
