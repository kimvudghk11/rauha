/** 채용 검토실 채널과 화면용 모양(core 의 interview.dto 와 같은 모양) */
export const INTERVIEW_IPC = {
  panel: 'interview:panel',
  facts: 'interview:facts',
  prepare: 'interview:prepare',
  market: 'interview:market',
  refreshMarket: 'interview:refresh-market',
  evaluate: 'interview:evaluate',
  ask: 'interview:ask',
} as const;

export interface RecruiterView {
  readonly name: string;
  readonly title: string;
  /** 기준을 말한 사람(출처) */
  readonly by: string;
  readonly rule: string;
}
/** 방 A~E 의 담당자 3명(고정). 공고는 보낼 때마다 PostingView 로 새로 온다 */
export interface CompanyView {
  readonly id: string;
  readonly lens: string;
  readonly recruiters: readonly RecruiterView[];
}
export interface PostingView {
  readonly id: string;
  readonly industry: string;
  readonly label: string;
  readonly size: string;
  readonly tier: string;
  /** "백엔드 개발자 · 경력 3년 이상" */
  readonly role: string;
  readonly minYears: number;
  readonly wants: readonly string[];
  /** 자리 하나에 오는 지원자 수(N:1) */
  readonly applicants: number;
  /** 단계별 통과율(%) */
  readonly passRates: Readonly<Record<string, number>>;
  /** 실제 공고 근거(시장 정보로 만들었을 때) */
  readonly basis: { readonly companies: readonly string[]; readonly sources: readonly { readonly title: string; readonly url: string }[]; readonly checkedAt: string } | null;
}
export interface MarketView {
  /** 실제 공고를 확인한 날(없으면 null = 내장 틀) */
  readonly checkedAt: string | null;
  readonly profiles: number;
}
export interface StageView {
  readonly id: string;
  readonly label: string;
}
export type StampView = 'pass' | 'hold' | 'drop';
export interface Line {
  readonly who: string;
  readonly text: string;
}
export interface VerdictView {
  readonly id: string;
  readonly reached: string;
  readonly stamp: StampView;
  /** 이 회사 지원자 중 추정 순위(상위 %) */
  readonly percentile: number;
  readonly stackHave: readonly string[];
  readonly stackMissing: readonly string[];
  readonly comment: string;
  readonly strengths: readonly string[];
  readonly gaps: readonly string[];
  readonly question: string;
  readonly notes: readonly { readonly who: string; readonly note: string }[];
  readonly evidence: readonly string[];
  readonly talk: readonly Line[];
}

/** 기다리는 동안 담당자들이 이야기할 거리: 내 커밋에서 바로 센 사실만(판정 없음) */
export interface WorkFacts {
  readonly total: number;
  readonly accounts: readonly { readonly label: string; readonly commits: number; readonly from: string; readonly to: string }[];
  readonly repos: readonly { readonly repo: string; readonly commits: number }[];
  /** 커밋 제목 몇 개 */
  readonly samples: readonly string[];
  /** 내가 바꾼 언어 비중(%) */
  readonly langs: readonly { readonly lang: string; readonly share: number }[];
  /** 레포 설정 파일에서 읽은 스택(합쳐서) */
  readonly stack: readonly string[];
}

/** 보내기 전 Me 칸 입력 */
export interface PrepareInput {
  readonly years: number;
  readonly role: string;
  readonly dbs: readonly string[];
}

export type InterviewReply<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: string };

export interface InterviewApi {
  panel(): Promise<{ readonly companies: readonly CompanyView[]; readonly stages: readonly StageView[] }>;
  /** 커밋에서 바로 센 사실(Me 칸에 보이고 DB 를 미리 체크한다). 공고는 만들지 않는다 */
  facts(): Promise<InterviewReply<WorkFacts>>;
  /** 내 작업을 모으고 내 연차·직무에 맞춰 이번 회사 공고 5개를 새로 만든다 */
  prepare(input: PrepareInput): Promise<InterviewReply<{ readonly facts: WorkFacts; readonly postings: readonly PostingView[] }>>;
  /** 저장된 실제 공고 시장 정보 */
  market(): Promise<MarketView>;
  /** 웹에서 실제 공고를 찾아 시장 정보를 새로 만든다(몇 분) */
  refreshMarket(): Promise<InterviewReply<MarketView>>;
  /** 회사 한 곳의 평가(회사마다 따로 불러 먼저 끝난 곳부터 보인다) */
  evaluate(id: string): Promise<InterviewReply<VerdictView>>;
  /** 회사 담당자들과 대화 */
  ask(id: string, history: readonly { readonly from: 'me' | 'them'; readonly text: string }[], question: string): Promise<InterviewReply<string>>;
}
