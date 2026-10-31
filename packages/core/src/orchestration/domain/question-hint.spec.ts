import { describe, expect, it } from 'vitest';
import { looksLikeQuestion } from './question-hint.js';

describe('looksLikeQuestion', () => {
  it('물음표나 의문 표현이 있으면 질문처럼 보인다', () => {
    expect(looksLikeQuestion('이거 뭐야?')).toBe(true);
    expect(looksLikeQuestion('Money.add는 왜 이렇게 짰어')).toBe(true);
    expect(looksLikeQuestion('ECS on EC2와 Fargate 차이 알려줘')).toBe(true);
  });

  it('짧은 인사나 맞장구도 질문처럼 보고 미리 답을 준비한다', () => {
    expect(looksLikeQuestion('안녕')).toBe(true);
    expect(looksLikeQuestion('고마워')).toBe(true);
  });

  it('무언가를 시키는 말은 질문처럼 보지 않는다 (답변 팀원을 괜히 부르지 않는다)', () => {
    expect(looksLikeQuestion('오타 고쳐줘')).toBe(false);
    expect(looksLikeQuestion('쿠폰 기능 만들어줘')).toBe(false);
    expect(looksLikeQuestion('이 앱 런칭 계획 짜줘')).toBe(false);
    expect(looksLikeQuestion('테스트 추가하고 왜 깨지는지도 알려줘')).toBe(false);
  });

  it('긴 서술이 의문 표현 없이 이어지면 질문처럼 보지 않는다', () => {
    expect(looksLikeQuestion('결제 모듈에 할인 쿠폰 적용 순서를 장바구니 단위로 바꾸는 방향으로 정리하고 싶어요')).toBe(false);
  });
});
