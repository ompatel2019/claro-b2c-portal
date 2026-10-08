#!/usr/bin/env bash
# Run a SQL file against the Supabase project via the Management API: scripts/sql.sh supabase/migrations/0002_x.sql
set -euo pipefail
ref=$(grep -E '^SUPABASE_PROJECT_REF=' .env.local | cut -d= -f2)
token=${SUPABASE_ACCESS_TOKEN:-$(grep -E '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2)}
jq -Rs '{query: .}' "$1" | curl -sS -X POST "https://api.supabase.com/v1/projects/$ref/database/query" \
  -H "Authorization: Bearer $token" -H 'Content-Type: application/json' --data-binary @-
echo
