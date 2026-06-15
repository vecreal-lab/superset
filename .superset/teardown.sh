#!/usr/bin/env bash
# No-op for Software Factory FACTORY_LOCAL_ONLY mode.
# Upstream Superset cloud infra (Neon, Electric SQL, multi-tenant auth)
# is bypassed. Factory boots via `bun run --cwd apps/desktop dev` directly.
# If upstream Superset cloud features are needed later, restore from git
# history at f36d66223088ba23b0e9d943e23579a4f8ade7c8.
export GIT_TERMINAL_PROMPT=0
exec </dev/null >/dev/null 2>&1
exit 0
