/** 문서 팀원 보고 → 사용자에게 보일 글. 깨진 출력도 버리지 않고 "보고를 읽지 못했다"로 알린다. */
export class WriterReportDto {
  private constructor(
    readonly summary: string,
    readonly files: readonly string[],
  ) {}

  static read(input: unknown): WriterReportDto {
    const o = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
    const summary = typeof o['summary'] === 'string' && o['summary'].trim() !== '' ? o['summary'].trim() : '문서 팀원의 보고를 읽지 못했어요. 만든 파일이 있는지 확인해 주세요.';
    const files = Array.isArray(o['files']) ? o['files'].filter((f): f is string => typeof f === 'string' && f.trim() !== '').map((f) => f.trim()) : [];
    return new WriterReportDto(summary, files);
  }

  toAnswer(): string {
    return this.files.length === 0 ? this.summary : `${this.summary}\n\n만든 문서\n${this.files.map((f) => `- ${f}`).join('\n')}`;
  }
}
