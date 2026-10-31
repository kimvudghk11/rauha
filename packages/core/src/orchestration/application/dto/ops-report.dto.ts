/** 운영 팀원 보고 → 사용자에게 보일 글. 깨진 출력도 버리지 않고 "보고를 읽지 못했다"로 알린다. */
export class OpsReportDto {
  private constructor(
    readonly answer: string,
    readonly commands: readonly string[],
  ) {}

  static read(input: unknown): OpsReportDto {
    const o = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
    const answer = typeof o['answer'] === 'string' && o['answer'].trim() !== '' ? o['answer'].trim() : '운영 팀원의 보고를 읽지 못했어요. 실행된 것이 있는지 확인해 주세요.';
    const commands = Array.isArray(o['commands']) ? o['commands'].filter((c): c is string => typeof c === 'string' && c.trim() !== '').map((c) => c.trim()) : [];
    return new OpsReportDto(answer, commands);
  }

  /** 답과, 실행한 명령 목록(사용자가 무엇이 돌았는지 볼 수 있게). */
  toAnswer(): string {
    return this.commands.length === 0 ? this.answer : `${this.answer}\n\n■ 실행한 명령\n${this.commands.map((c) => `- ${c}`).join('\n')}`;
  }
}
