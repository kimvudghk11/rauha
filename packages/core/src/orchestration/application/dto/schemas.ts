/** 팀원 구조화 출력(Agent SDK outputFormat)용 JSON Schema. DTO의 from()이 같은 모양을 검증한다. */

const str = { type: 'string', minLength: 1 } as const;
const nullableStr = { type: ['string', 'null'] } as const;
const strList = { type: 'array', items: str } as const;

export const INTAKE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'fileCount', 'crossModule', 'sensitive', 'scope', 'acceptance', 'doneWhen', 'forbidden', 'assumptions'],
  properties: {
    title: { ...str, description: '업무 한 줄 목표' },
    fileCount: { type: 'integer', minimum: 1, description: '바뀔 것으로 보이는 파일 수(테스트 포함)' },
    crossModule: { type: 'boolean', description: '모듈 경계를 넘는 변경인지' },
    sensitive: { type: 'boolean', description: '인증·권한·암호화·결제·개인정보가 걸렸는지' },
    scope: { ...strList, minItems: 1, description: '건드려도 되는 경로 패턴(작업 폴더 기준, 예: src/domain/money.ts, src/cart/**)' },
    acceptance: {
      type: 'array',
      minItems: 2,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'text'],
        properties: { kind: { enum: ['happy', 'error'] }, text: str },
      },
    },
    doneWhen: str,
    forbidden: strList,
    assumptions: {
      type: 'array',
      maxItems: 3,
      description: '요청이 두 가지 이상으로 읽혀 결과가 달라지는 지점. 없으면 빈 배열.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'chosen', 'alternatives'],
        properties: {
          question: { ...str, description: '무엇이 갈리는지 한 줄' },
          chosen: { ...str, description: '고른 해석. 구체적인 예시 값 포함' },
          alternatives: { ...strList, minItems: 1, maxItems: 3, description: '다른 해석들. 각각 예시 값 포함' },
        },
      },
    },
  },
};

const reportProperties = {
  result: { enum: ['done', 'failed', 'needs-decision'] },
  did: { ...strList, minItems: 1, maxItems: 3 },
  changedFiles: strList,
  passed: { type: 'integer', minimum: 0 },
  failed: { type: 'integer', minimum: 0 },
  failedTests: strList,
  remaining: nullableStr,
  question: nullableStr,
} as const;

const reportRequired = ['result', 'did', 'changedFiles', 'passed', 'failed', 'failedTests', 'remaining', 'question'];

export const TESTER_REPORT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: reportRequired,
  properties: reportProperties,
};

export const IMPLEMENTER_REPORT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [...reportRequired, 'explanation'],
  properties: {
    ...reportProperties,
    explanation: {
      type: 'object',
      additionalProperties: false,
      required: ['decisions', 'readingOrder', 'manualChecks', 'untested'],
      properties: {
        decisions: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['what', 'why', 'rejected'],
            properties: { what: str, why: str, rejected: nullableStr },
          },
        },
        readingOrder: {
          type: 'array',
          minItems: 2,
          maxItems: 4,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['path', 'line', 'note'],
            properties: { path: str, line: { type: ['integer', 'null'], minimum: 1 }, note: str },
          },
        },
        manualChecks: { ...strList, minItems: 1, maxItems: 3 },
        untested: { ...strList, maxItems: 3 },
      },
    },
  },
};
