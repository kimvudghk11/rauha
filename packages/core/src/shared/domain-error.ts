/**
 * 도메인 규칙 위반. code는 CLI가 메시지를 고르거나 테스트가 원인을 확인할 때 쓴다.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
