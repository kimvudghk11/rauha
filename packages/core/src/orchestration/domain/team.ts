/** 팀원 역할. 팀장(lead)은 파일을 쓰지 않고 배분만 한다. */
export type TeamRole =
  | 'lead'
  | 'planner'
  | 'architect'
  | 'tester'
  | 'implementer'
  | 'reviewer'
  | 'debugger'
  | 'infra'
  | 'writer';

export type ModelTier = 'haiku' | 'sonnet' | 'opus';

export const MODEL_ID: Readonly<Record<ModelTier, string>> = {
  haiku: 'claude-haiku-5-5',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
};

/** 팀장이 다음에 누구를 어떤 모델로 부를지. */
export interface Assignment {
  readonly role: TeamRole;
  readonly tier: ModelTier;
}
