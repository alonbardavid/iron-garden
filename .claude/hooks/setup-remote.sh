#!/bin/bash
set -ex

# Only run in web (remote) environment
if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$PROJECT_DIR"

# Use a local bin directory (no sudo needed)
LOCAL_BIN="$HOME/.local/bin"
mkdir -p "$LOCAL_BIN"
export PATH="$LOCAL_BIN:$PATH"

# Install gh CLI if not present
if ! command -v gh &> /dev/null; then
  echo "Installing gh CLI via apt..." >&2
  apt-get install -y -qq gh
  echo "gh CLI installed" >&2
fi

# Add github remote for gh CLI detection. Origin may be a proxy URL
# (.../git/<owner>/<repo>), an https clone URL or an scp-style one, so take the
# last two path segments and drop any .git suffix.
REPO=$(git remote get-url origin 2>/dev/null | sed -E 's|\.git$||; s|.*[:/]([^/]+/[^/]+)$|\1|')
if [ -n "$REPO" ] && ! git remote get-url github &>/dev/null; then
  git remote add github "https://github.com/${REPO}.git"
fi

# Install workspace dependencies (matches CI). Idempotent: a fast no-op once the
# pnpm store and node_modules are populated. Must run before the browser install
# below, which needs the @playwright/test binary from node_modules.
echo "Installing dependencies (pnpm install)..." >&2
if ! pnpm install --frozen-lockfile; then
  echo "WARN: pnpm install failed — dependencies may be incomplete." >&2
fi

# Download the Chromium build that matches @playwright/test. Playwright fetches
# it from cdn.playwright.dev, which the environment's network policy must allow.
# Idempotent: skips when the build is already cached. Kept non-fatal so the
# session still starts if the host is not yet allowlisted (or deps are missing).
echo "Installing Playwright chromium..." >&2
if ! pnpm --filter tests exec playwright install chromium; then
  echo "WARN: Playwright browser install failed — ensure cdn.playwright.dev is allowed in the environment's network policy." >&2
fi

# Run @playwright/cli headless and without the Chromium sandbox (no display,
# runs as root in the worker). It resolves the browser installed above.
mkdir -p "$PROJECT_DIR/.playwright"
cat > "$PROJECT_DIR/.playwright/cli.config.json" <<'EOF'
{
  "browser": {
    "browserName": "chromium",
    "launchOptions": {
      "headless": true,
      "chromiumSandbox": false
    }
  }
}
EOF
