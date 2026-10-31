/** 디버깅·위험 점검 팀원 보고 → 사용자에게 보일 글. 깨진 출력도 버리지 않고 "보고를 읽지 못했다"로 알린다. */
export class AnalysisReportDto {
  private constructor(
    readonly answer: string,
    readonly files: readonly string[],
  ) {}

  /** from: 보고한 팀원 이름(깨졌을 때 안내에 쓴다) */
  static read(input: unknown, from: string): AnalysisReportDto {
    const o = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
    const answer = typeof o['answer'] === 'string' && o['answer'].trim() !== '' ? o['answer'].trim() : `${from} 팀원의 보고를 읽지 못했어요. 한 번 더 요청해 주세요.`;
    const files = Array.isArray(o['files']) ? o['files'].filter((f): f is string => typeof f === 'string' && f.trim() !== '').map((f) => f.trim()) : [];
    return new AnalysisReportDto(answer, files);
  }

  /** 답과, 살펴본 파일 목록(근거를 눈으로 확인할 수 있게). */
  toAnswer(): string {
    return this.files.length === 0 ? this.answer : `${this.answer}\n\n■ 살펴본 파일\n${this.files.map((f) => `- ${f}`).join('\n')}`;
  }
}
