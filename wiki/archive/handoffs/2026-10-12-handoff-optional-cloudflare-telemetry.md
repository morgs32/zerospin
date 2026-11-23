# Handoff: Optional Cloudflare telemetry

**Date:** 2026-10-12
**Status:** Superseded receiving context, reconciled into active [Plan 143](../../plans/143-plan-optional-effect-telemetry.md) on 2026-10-12. Source cutover and permanent local transport/lifetime verification are complete; real hosted-provider proof remains open in that plan. This archival is reconciliation, not verified completion.

## Reconciled direction

1. Applications can enable optional direct Effect-origin OTLP logs/traces. The original Cloudflare-managed custom-span proposal was replaced after [Effect v4/native tracing research](../../research/effect-v4-cloudflare-native-tracing.md) established the ancestry/ID limitations. Cloudflare-native platform telemetry remains an independent optional deployment choice.
2. Full local Effect capture remains available to profiles and Devtools. Source-owned records are exported once; imported remote history stays local. No diagnostic SQL fallback or duplicate hosted application tracer remains.
3. Backend references name actual trace/span IDs without promising delivery or immediate indexing. The user selected provider investigation links in Studio; no provider query facade was added.
4. Mandatory admission-attempt auditing remains in SystemLogRepo. Whether to make that audit optional is outside this telemetry cutover and remains a separate design question.

## Continuing work

1. Use [Plan 143 Remaining work](../../plans/143-plan-optional-effect-telemetry.md#remaining-work) for real provider-arrival configuration. The user authorized contained permanent verification, now passing under test/telemetry (`packages/system-worker/test/telemetry/README.md`, removed 2026-10-17). Do not recreate this handoff's superseded SQL APIs or managed Effect-span bridge.
2. No provider account, destination, paid plan, deployment, or persistent-storage reset was selected or performed. Fixed affected SystemLogRepo storage must be empty before using the new schema.

## Suggested skills

1. [$implement](../../../../wiki/skills/implement/SKILL.md) — finish the active plan's required verification and archive only after completion.
2. [$nx-workspace](../../../.agents/skills/nx-workspace/SKILL.md) and [$nx-run-tasks](../../../.agents/skills/nx-run-tasks/SKILL.md) — use actual resolved targets and scoped checks.

## Pointers

1. [Implemented deployment/correlation documentation](../../../README.md)
2. [Authored System architecture](../../architecture/AuthoredSystem.md)
3. [System API architecture](../../architecture/SystemApi.md)
4. [Worker emission](../../../packages/system-worker/src/repoServices/WorkerTelemetryLive.ts)
5. [Scoped OTLP export](../../../packages/system-worker/src/exportTelemetryBatch/exportTelemetryBatch.ts)
6. [Mandatory audit storage](../../../packages/system-worker/src/SystemLogRepo/systemLogRepoDbConfig.ts)
