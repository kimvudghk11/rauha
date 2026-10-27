import { createHash } from 'node:crypto';
import { toPosixPath } from './path-pattern.js';

/**
 * 프로젝트(저장소 최상위 경로)마다 다른 짧은 키. 기억·잠금·이어 갈 대화 파일 이름에 쓴다.
 * 경로 표기(대소문자, \ 와 /, 끝 구분자) 차이는 같은 프로젝트로 본다. Node crypto를 쓰므로 domain에서는 쓰지 않는다.
 */
export function projectKey(projectRoot: string): string {
  return createHash('sha256').update(toPosixPath(projectRoot).toLowerCase()).digest('hex').slice(0, 12);
}
