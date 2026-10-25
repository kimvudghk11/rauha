# 장바구니 예제

작은 장바구니 도메인. TypeScript + vitest.

## 구조

- `src/shared/` — 여러 곳에서 쓰는 도구. 금액 표시는 `formatWon`, 오류는 `AppError`만 쓴다.
- `src/domain/` — 규칙. `Money`(값 객체), `Cart`(엔티티). 바깥(입출력)을 모른다.
- `src/application/` — 도메인을 불러 쓰는 서비스. 규칙을 직접 계산하지 않고 도메인 메서드를 부른다.

## 규칙

- 금액은 언제나 `Money`로 다룬다. number로 계산하지 않는다.
- 이미 있는 shared 도구를 다시 만들지 않는다.
- 잘못된 입력은 `AppError`를 던진다. 코드(`code`)는 대문자 스네이크 케이스.
- 테스트는 대상 파일 옆 `*.spec.ts`. 테스트 이름은 한국어 문장.
- 명령: `npm run test`, `npm run typecheck`
