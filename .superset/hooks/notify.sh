#!/usr/bin/env bash
# Intentionally no-op for Software Factory local runs.
# Notification hooks must never spawn interactive login shells during Codex git operations.
export GIT_TERMINAL_PROMPT=0
exec </dev/null >/dev/null 2>&1
exit 0
