import { SecretPolicy } from '../../domain/secret-policy.js';

/** 저장소의 `.rauhaignore` 글 → 비밀 파일 규칙. 한 줄에 패턴 하나, 빈 줄과 `#` 주석은 버린다. */
export class RauhaIgnoreDto {
  private constructor(private readonly patterns: readonly string[]) {}

  /** text: 파일 내용. 파일이 없으면 null. */
  static from(text: string | null): RauhaIgnoreDto {
    const patterns = (text ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));
    return new RauhaIgnoreDto(patterns);
  }

  toEntity(): SecretPolicy {
    return SecretPolicy.of(this.patterns);
  }
}
