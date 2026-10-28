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

## 설치 (새 PC에서 한 번)

Git, Node.js 24 LTS, Yarn(corepack), Claude Code, rauha를 차례로 설치하고 `rauha` 명령을 만든다. 이미 있는 것은 건너뛰므로 여러 번 실행해도 된다.

macOS (터미널):

```bash
curl -fsSL https://raw.githubusercontent.com/kimvudghk11/rauha/main/scripts/install.sh | bash
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/kimvudghk11/rauha/main/scripts/install.ps1 | iex
```

| 단계 | macOS | Windows | 이미 있으면 |
| --- | --- | --- | --- |
| 패키지 관리자 | Homebrew | winget(Windows 기본) | 건너뜀 |
| Git | `brew install git` | `winget install -e --id Git.Git` | `git`이 있으면 건너뜀 |
| Node.js | `brew install node@24` | `winget install -e --id OpenJS.NodeJS.LTS` (nvm이 있으면 `nvm install 24.22.1`) | Node 22 이상이면 건너뜀 |
| Yarn | `corepack enable` | `corepack enable` | `yarn`이 돌면 건너뜀 |
| Claude Code | `curl -fsSL https://claude.ai/install.sh \| bash` | `irm https://claude.ai/install.ps1 \| iex` | `claude`가 있으면 건너뜀 |
| rauha | `~/rauha`에 clone → `yarn install` → `yarn build` → `rauha setup` | `~\rauha`에 같은 순서 | 있으면 `git pull --ff-only` |

설치 폴더는 `RAUHA_DIR` 환경 변수로 바꿀 수 있다. 설치가 끝나면 새 터미널에서 `rauha login`을 한 번 하고, 프로젝트 폴더에서 `rauha`를 입력한다.

### 회사 계정 따로 쓰기

`~/.rauha/config.toml`에 프로필과 폴더 규칙을 적으면, 폴더(또는 git 원격 주소)에 따라 계정이 갈린다. 회사 맥북처럼 회사 계정만 쓰면 `default_profile = "work"`만 적어도 된다.

```toml
default_profile = "work"

[profiles.work]
claude_config_dir = "~/.rauha/profiles/work/claude"
sync = "none"

[profiles.personal]
claude_config_dir = "~/.rauha/profiles/personal/claude"

[[match]]
git_remote = "github.com/my-company/*"
profile = "work"
```

프로필마다 한 번씩 로그인한다: `rauha login --profile work`.

## 개발

Node.js 22 이상과 Corepack이 필요하다.

```bash
corepack enable          # yarn 4 를 package.json 의 packageManager 버전으로 사용
yarn install
yarn test                # 테스트
yarn typecheck           # 타입 검사
yarn build               # dist 빌드
yarn rauha whoami        # CLI 실행
yarn rauha setup         # 처음 한 번: 어느 폴더에서든 rauha로 부를 수 있게 한다
```

`rauha setup`은 PATH에 있는 폴더(Windows는 `%APPDATA%\npm`, macOS·Linux는 `~/.local/bin`)에 이 저장소의 빌드 결과를 부르는 실행 파일을 둔다. 그 뒤로는 작업할 프로젝트 폴더에서 `rauha`만 입력하면 된다. `rauha update`로 갱신하면 같은 실행 파일이 새 버전을 부른다.

대화 중 `/review`는 커밋하지 않은 내 변경(또는 `/review <브랜치>`로 그 브랜치와 갈라진 뒤의 변경)을 리뷰어가 검토한다. 파일은 고치지 않고 근거가 확인된 지적만 보여 준다. `rauha --continue`(`-c`)는 지난 대화를 이어서 연다(`/update` 뒤에는 자동).

팀원과 rauha는 비밀 파일을 읽지도 쓰지도 않는다. 기본 목록(`.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa*` 등, `.env.example` 같은 예시 파일은 제외)에 더해, 저장소 루트의 `.rauhaignore`에 한 줄에 하나씩 `.gitignore`처럼 적으면 함께 막는다(`secrets/`는 그 폴더 전체, `/config/prod.json`은 루트 기준, `/`가 없으면 어느 폴더에서든). 비밀 파일이 있는 저장소에서는 내용을 폴더째 뒤지는 검색(`grep -r`, `rg`, `git grep`, 폴더 대상 Grep 내용 검색)도 막는다. 파일 이름만 찾는 검색은 된다.

저장소 여러 개를 담은 폴더(예: `~/work`)에서 `rauha`를 띄우면 그 아래 저장소(두 단계까지)를 모두 작업 공간에 넣는다. 메시지에 저장소 이름이 나오면 그 저장소에서, 없으면 마지막으로 다룬 저장소에서 일하고, 그래도 모르면 묻는다. 두 저장소를 함께 말하면 한 답으로 비교해 준다(여러 저장소를 한 번에 고치는 일은 아직 하지 않는다). `/repo`로 목록, `/repo <이름>`으로 바꾸기, `/repo add <경로>`로 더하기. 저장소마다 그 폴더 규칙의 계정으로 일한다.

답과 결과 안내서에는 어느 브랜치·커밋을 보고 판단했는지(`읽은 기준: main (a1b2c3d)`)가 붙는다. rauha는 저장소마다 구조와 짧은 메모를 `~/.rauha/profiles/<프로필>/knowledge/`에 남겨 두고, 다음에는 git diff로 바뀐 부분만 고친다.

같은 폴더에서는 작업이 한 번에 하나만 돈다(다른 rauha가 작업 중이면 시작하지 않고 알린다). 같은 프로젝트에서 작업 두 개를 동시에 돌리려면 `git worktree add ../<이름> -b <브랜치>`로 폴더를 하나 더 만들어 거기서 띄운다.

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
