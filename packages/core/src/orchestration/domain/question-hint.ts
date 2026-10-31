const ACTION = /(해\s?줘|해주세요|만들|고쳐|추가|수정|삭제|지워|바꿔|써\s?줘|작성|구현|리팩|정리해|돌려|실행|배포|생성|짜\s?줘|뽑아|지어)/;
const QUESTION = /(\?|？|뭐|왜|어떻게|어디|언제|누가|무엇|얼마|어떤|몇|차이|알려|설명|인가|일까|나요|까요|있어|없어|맞아)/;
/** 이 길이 이하의 짧은 말은 인사·맞장구로 본다 */
const SMALL_TALK_CHARS = 8;

/**
 * 입력이 질문처럼 보이는지. 라우터가 답하기 전에 답변 팀원을 미리 띄울지 정하는 데만 쓴다.
 * 틀려도 정답이 바뀌지 않는다: 질문인데 놓치면 라우터 뒤에 시작해 조금 느릴 뿐이고,
 * 질문이 아닌데 질문으로 보면 호출 하나가 버려진다. 그래서 확실히 시키는 말은 거른다.
 */
export function looksLikeQuestion(input: string): boolean {
  const text = input.trim();
  if (ACTION.test(text)) return false;
  return QUESTION.test(text) || text.length <= SMALL_TALK_CHARS;
}
