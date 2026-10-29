/** 설계 대화에서 사용자와 주고받는 것과 설계 문서 저장. 다른 컨텍스트의 포트를 가져오지 않는다(순환을 피하려고). */

export interface DesignQuestion {
  readonly question: string;
  /** 설계 팀원이 추천하는 답. 사용자가 "알아서"라고 하면 이것으로 정한다 */
  readonly suggestion: string | null;
  /** 몇 번째 질문인지(1부터) */
  readonly round: number;
}

export type DesignApproval = { readonly kind: 'approve' } | { readonly kind: 'revise'; readonly note: string } | { readonly kind: 'cancel' };

export interface DesignPlan {
  readonly title: string;
  /** 승인 화면에 보일 요약 줄들 */
  readonly summary: readonly string[];
  /** 설계 문서 경로 */
  readonly path: string;
}

/** 설계 대화에서 사용자와 주고받는 것. 질문에 답하지 않고 그만두면 discuss가 null. */
export interface DesignUserPort {
  discuss(question: DesignQuestion): Promise<string | null>;
  approve(plan: DesignPlan): Promise<DesignApproval>;
}

export interface DesignStorePort {
  /** 설계 문서를 저장하고 경로를 돌려준다 */
  save(name: string, markdown: string): Promise<string>;
}
