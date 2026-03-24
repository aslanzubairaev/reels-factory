#!/bin/bash
# Blocks commits that include .env files with API keys
# Exit code 2 = block the action

if git diff --cached --name-only | grep -qE '\.env$'; then
  echo '{"block": true, "message": "BLOCKED: .env contains API keys and must not be committed. Remove it from staging: git reset HEAD .env"}' >&2
  exit 2
fi
