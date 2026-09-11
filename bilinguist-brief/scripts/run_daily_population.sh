#!/bin/bash
# Runs the daily word-population mission unattended via launchd (see
# com.bilinguistbrief.dailypopulation.plist). Logs to daily_population.log
# next to this script so a failed run can be inspected the next morning.

set -euo pipefail
cd "$(dirname "$0")"

/opt/homebrew/bin/claude \
  --print \
  --allowedTools "Bash Read Write Edit Glob Grep Workflow" \
  --permission-mode dontAsk \
  "$(cat DAILY_POPULATION_MISSION.md)" \
  >> daily_population.log 2>&1

echo "=== run finished $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >> daily_population.log
