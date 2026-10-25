/** 잘못된 입력이나 규칙 위반. code로 원인을 구분한다. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
