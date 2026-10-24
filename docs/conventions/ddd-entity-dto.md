# 개발 규칙: DDD + 엔티티·DTO 메서드 중심

이 규칙은 **rauha 저장소 자체**에만 적용한다. 완성된 rauha로 다른 프로젝트를 개발할 때는 그 프로젝트의 `CLAUDE.md`와 기존 코드 방식을 따른다.

## 한 줄 요약

규칙은 엔티티와 값 객체의 메서드에, 바깥 입력의 검증과 변환은 DTO의 메서드에 둔다. 서비스는 "불러오기 → 메서드 호출 → 저장" 순서만 책임지는 얇은 조정자다.

## 폴더 구조

바운디드 컨텍스트마다 같은 세 층을 둔다.

```
packages/core/src/
├── shared/                         # 컨텍스트 공통 (DomainError, 경로 패턴, 입력 검증 도구)
├── orchestration/                  # 팀 오케스트레이션 컨텍스트
│   ├── domain/                     # 엔티티, 값 객체, 저장소 인터페이스
│   │   ├── work-order.ts           # 애그리거트 루트: 파이프라인 전이 규칙
│   │   ├── difficulty.ts           # 값 객체: S/M/L 판정
│   │   ├── test-run.ts             # 값 객체: Red/Green 판정
│   │   ├── write-policy.ts         # 값 객체: 역할별 쓰기 권한
│   │   └── work-order.repository.ts
│   ├── application/
│   │   ├── dto/                    # 바깥 입력 ↔ 도메인 변환
│   │   └── work-order.service.ts   # 얇은 조정자
│   └── infrastructure/             # 저장소 구현 (메모리, 파일, DynamoDB …)
└── profile/                        # 계정 프로필 컨텍스트 (같은 구조)
```

의존 방향은 `infrastructure → application → domain` 한쪽뿐이다. domain은 Node API, 파일 시스템, Agent SDK를 import하지 않는다.

## 엔티티

- 생성자는 `private`으로 두고, 정적 팩토리(`open`, `create`)로만 만든다. 팩토리가 불변식을 검사한다.
- 상태는 바깥에서 직접 바꿀 수 없다. 바꾸는 방법은 **의도를 이름으로 가진 메서드**뿐이다.
  - 좋음: `order.recordGreen(run)`, `order.approveScenario(summary)`
  - 나쁨: `order.stage = 'review'`, `order.setStage(...)`
- 읽기는 getter로 열어 둔다. 판단이 필요한 읽기는 메서드로 만든다(`isFinished()`, `nextAssignment()`).
- 규칙 위반은 `DomainError(code, message)`로 던진다. `code`는 테스트와 CLI 메시지가 쓴다.
- 숫자 규칙(2회, 300토큰 등)은 파일 위쪽 상수로 이름을 붙인다.

## 값 객체

- 같은 값이면 같은 것으로 본다(`equals`). 불변이다.
- 판정 로직이 있으면 값 객체의 메서드로 둔다: `Difficulty.judge()`, `TestRun.isValidRed()`, `WritePolicy.allows()`.

## DTO

DTO는 데이터 묶음이 아니라 **경계에서 일하는 객체**다. 다음 메서드를 기본으로 가진다.

| 메서드 | 하는 일 |
| --- | --- |
| `static from(input: unknown)` | 모델 출력, 설정 파일, CLI 인자 같은 바깥 입력을 검증해서 DTO로 만든다 |
| `toEntity(...)` | 도메인 엔티티나 값 객체를 만든다 |
| `static fromEntity(entity)` | 엔티티를 화면·보고용 형태로 바꾼다 |
| `toMarkdown()`, `toStatusLine()` 등 | 출력 형식 |
| 경계 규칙(`isWithinBudget()` 등) | 도메인 규칙이 아닌 입출력 규칙 |

- 생성자는 `private`, 필드는 `readonly`.
- 검증 도구는 `shared/validation.ts`를 쓴다. 실패하면 `DomainError('INVALID_INPUT', …)`.
- 설정 파일의 `snake_case` 키는 DTO의 `from()`에서만 다루고, 도메인에는 `camelCase`로 넘긴다.

## 서비스

```ts
async submitImplementation(id: string, report: WorkReportDto) {
  const order = await this.load(id);                          // 불러오기
  order.assertDiffAllowed('implementer', report.changedFiles); // 엔티티 메서드
  order.recordGreen(report.toTestRun(), report.toFailureNote()); // 엔티티 + DTO 메서드
  await this.repository.save(order);                          // 저장
  return WorkOrderStatusDto.fromEntity(order);                // DTO 메서드
}
```

서비스 안에 `if`로 도메인 규칙을 쓰고 싶어지면, 그 규칙은 엔티티 메서드로 옮겨야 한다는 신호다.

## 테스트 (TDD)

- 규칙을 바꾸거나 추가할 때는 실패하는 spec부터 쓴다.
- spec은 대상 파일 옆에 `*.spec.ts`로 둔다.
- 테스트 이름은 한국어로, 설계서의 규칙 문장을 그대로 쓴다. 예: `'주니어 2회 실패 → 시니어 → 디버깅 → 설계 자문 → 중단'`
- 도메인 테스트는 목(mock) 없이 엔티티를 직접 만든다. 저장소가 필요하면 `InMemory…Repository`를 쓴다.

## 이름

| 대상 | 규칙 | 예 |
| --- | --- | --- |
| 파일 | kebab-case, 역할 접미사 | `work-order.ts`, `work-report.dto.ts`, `work-order.repository.ts` |
| 클래스 | PascalCase, DTO는 `Dto` 접미사 | `WorkOrder`, `WorkReportDto` |
| import | ESM, 상대 경로에 `.js` 확장자 | `import { WorkOrder } from './work-order.js'` |
