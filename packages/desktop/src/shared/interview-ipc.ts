/** 면접관 패널 채널과 화면용 모양(core 의 interview.dto 와 같은 모양) */
export const INTERVIEW_IPC = {
  panel: 'interview:panel',
  evaluate: 'interview:evaluate',
  ask: 'interview:ask',
} as const;

export interface InterviewerView {
  readonly id: string;
  readonly name: string;
  readonly lens: string;
}
export interface StageView {
  readonly id: string;
  readonly label: string;
}
export interface VerdictView {
  readonly id: string;
  readonly reached: string;
  readonly comment: string;
  readonly strengths: readonly string[];
  readonly gaps: readonly string[];
  readonly question: string;
}
export interface InterviewView {
  readonly overall: { readonly reached: string; readonly summary: string; readonly strengths: readonly string[]; readonly gaps: readonly string[]; readonly next: readonly string[] };
  readonly panel: readonly VerdictView[];
}

export type InterviewReply<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: string };

export interface InterviewApi {
  panel(): Promise<{ readonly interviewers: readonly InterviewerView[]; readonly stages: readonly StageView[] }>;
  /** 내 작업(My work 의 계정들)을 모아 패널 평가를 받는다 */
  evaluate(): Promise<InterviewReply<InterviewView>>;
  /** 면접관 한 명과 대화 */
  ask(id: string, history: readonly { readonly from: 'me' | 'them'; readonly text: string }[], question: string): Promise<InterviewReply<string>>;
}
