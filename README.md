# rauha

> *rauha* — 핀란드어로 "평화, 고요함". [ˈrɑu̯hɑ] 라우하

터미널에서 `rauha`를 치면 팀장과 대화가 시작되고, 팀장은 업무를 작게 쪼개 BDD/TDD 순서로 팀원에게 나눠 준다. 쉬운 일은 Haiku, 테스트가 실패할 때만 Sonnet·Opus로 올린다.

```
나 ↔ 팀장 (Sonnet) ↔ 기획 · 설계 · 테스트 · 구현 · 리뷰 · 문서 · 디버깅 · 인프라
```

- 설계서: [docs/design/claude-team-design.md](docs/design/claude-team-design.md)
- 개발 규칙: [docs/conventions/ddd-entity-dto.md](docs/conventions/ddd-entity-dto.md)

## 지금 상태

| 패키지 | 내용 | 상태 |
| --- | --- | --- |
| `@rauha/core` | 파이프라인 상태 머신(`WorkOrder`), 승격 사다리, 역할별 쓰기 권한, 보고서 DTO, 회사/개인 프로필 판정 | 동작 + 테스트 |
| `@rauha/cli` | `rauha --help`, `rauha whoami`, `--profile` | 뼈대. 대화 모드는 구현 전 |

## 시작하기

Node.js 22 이상과 Corepack이 필요하다.

```bash
corepack enable          # yarn 4 를 package.json 의 packageManager 버전으로 사용
yarn install
yarn test                # 테스트
yarn typecheck           # 타입 검사
yarn build               # dist 빌드
yarn rauha whoami        # CLI 실행
```

전역 명령으로 쓰려면 빌드 후 `packages/cli`에서 `npm link`(또는 `yarn link`)한다.

## 구조

```
rauha/
├── packages/
│   ├── core/   # 도메인: orchestration, profile (DDD)
│   └── cli/    # rauha 명령어
└── docs/
    ├── design/       # 팀 구성 설계서
    └── conventions/  # 개발 규칙
```
