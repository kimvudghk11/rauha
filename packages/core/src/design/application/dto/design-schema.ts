/** 설계 팀원 구조화 출력용 JSON Schema. DesignReplyDto.from()이 같은 모양을 검증한다. */

const str = { type: 'string', minLength: 1 } as const;
const strList = { type: 'array', items: str } as const;

export const DESIGN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'question', 'suggestion', 'design'],
  properties: {
    status: { enum: ['ask', 'draft'], description: 'ask: 사용자에게 질문 하나를 한다. draft: 승인받을 설계안을 낸다' },
    question: { type: ['string', 'null'], description: 'status가 ask일 때만. 사용자에게 할 질문 하나(한국어). 아니면 null' },
    suggestion: { type: ['string', 'null'], description: 'status가 ask일 때 추천하는 답 한 줄. 사용자가 "알아서"라고 하면 이 값으로 정한다. 없으면 null' },
    design: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'purpose', 'goals', 'nonGoals', 'scenarios', 'decisions', 'tasks', 'risks'],
          properties: {
            title: str,
            purpose: { ...str, description: '왜 필요한지와 무엇을 만드는지' },
            goals: strList,
            nonGoals: strList,
            scenarios: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['given', 'when', 'then'],
                properties: { given: str, when: str, then: { ...str, description: '구체적인 값으로(예: 10% 할인하면 10,000원이 9,000원)' } },
              },
            },
            decisions: {
              type: 'array',
              items: { type: 'object', additionalProperties: false, required: ['what', 'by'], properties: { what: str, by: { enum: ['user', 'rauha'] } } },
            },
            tasks: {
              type: 'array',
              minItems: 1,
              maxItems: 8,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'title', 'scope', 'acceptance', 'dependsOn'],
                properties: {
                  id: { ...str, description: 't1, t2 …' },
                  title: str,
                  scope: { ...strList, minItems: 1, description: '건드려도 되는 경로 패턴' },
                  acceptance: { ...strList, minItems: 1, description: '테스트로 옮길 수 있는 구체적인 수용 기준' },
                  dependsOn: { ...strList, description: '먼저 끝나야 하는 작업 id' },
                },
              },
            },
            risks: strList,
          },
        },
      ],
    },
  },
};
