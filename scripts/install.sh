#!/usr/bin/env bash
# rauha 설치 (macOS). 이미 있는 것은 건너뛴다. 여러 번 실행해도 된다.
#   curl -fsSL https://raw.githubusercontent.com/kimvudghk11/rauha/main/scripts/install.sh | bash
# 바꿀 수 있는 값: RAUHA_DIR(설치 폴더, 기본 ~/rauha), RAUHA_REPO(저장소 주소)
set -euo pipefail

RAUHA_DIR="${RAUHA_DIR:-$HOME/rauha}"
RAUHA_REPO="${RAUHA_REPO:-https://github.com/kimvudghk11/rauha.git}"
NODE_MIN=22
# corepack이 Yarn을 처음 받을 때 묻지 않게(curl | bash로 돌리면 답할 수 없다).
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

step() { printf '\n\033[36m▸ %s\033[0m\n' "$*"; }
skip() { printf '  ✓ %s — 이미 있어서 건너뛰어요\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

# 셸 설정 파일에 PATH 줄을 한 번만 더한다(새 터미널부터 적용). 지금 셸에도 바로 넣는다.
RC="$HOME/.zshrc"
case "${SHELL:-}" in */bash) RC="$HOME/.bash_profile" ;; esac
add_path() {
  export PATH="$1:$PATH"
  grep -qsF "$1" "$RC" || printf '\nexport PATH="%s:$PATH"\n' "$1" >> "$RC"
}

case "$(uname -s)" in
  Darwin) ;;
  *) echo "이 스크립트는 macOS용이에요. Windows는 scripts/install.ps1을 쓰세요."; exit 1 ;;
esac

step "Homebrew"
if have brew; then skip "Homebrew $(brew --version | head -1 | awk '{print $2}')"; else
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [ -x "$b" ]; then eval "$("$b" shellenv)"; grep -qsF 'brew shellenv' "$RC" || echo "eval \"\$($b shellenv)\"" >> "$RC"; break; fi
  done
fi

step "Git"
if have git; then skip "Git $(git --version | awk '{print $3}')"; else brew install git; fi

step "Node.js ${NODE_MIN} 이상 (24 LTS 권장)"
if have node && [ "$(node_major)" -ge "$NODE_MIN" ]; then skip "Node $(node -v)"; else
  brew install node@24
  add_path "$(brew --prefix node@24)/bin"
fi

step "Yarn (corepack)"
if ! have corepack; then npm install -g corepack; fi
if have yarn && yarn --version >/dev/null 2>&1; then skip "Yarn $(yarn --version)"; else corepack enable; fi

step "Claude Code (rauha login에 필요)"
if have claude; then skip "Claude Code $(claude --version 2>/dev/null | awk '{print $1}')"; else
  curl -fsSL https://claude.ai/install.sh | bash
fi
add_path "$HOME/.local/bin"

step "rauha 내려받기 ($RAUHA_DIR)"
if [ -d "$RAUHA_DIR/.git" ]; then
  skip "rauha 저장소"
  git -C "$RAUHA_DIR" pull --ff-only || echo "  ! 새 커밋을 받지 못했어요(바뀐 파일이 있을 수 있어요). 지금 있는 것으로 계속해요."
else
  git clone "$RAUHA_REPO" "$RAUHA_DIR"
fi

step "의존성 설치와 빌드 (이미 설치돼 있으면 빠르게 끝나요)"
cd "$RAUHA_DIR"
corepack yarn install
corepack yarn build

step "어느 폴더에서든 rauha로 부르기"
node packages/cli/dist/main.js setup || true

printf '\n\033[32m설치를 마쳤어요.\033[0m 새 터미널을 열고:\n'
printf '  rauha login                 # Claude 계정 로그인 (처음 한 번)\n'
printf '  cd <프로젝트 폴더> && rauha   # 대화 모드\n'
printf '회사 계정을 따로 쓰려면 ~/.rauha/config.toml에 프로필을 적고 rauha login --profile <이름>을 하세요(README 참고).\n'
