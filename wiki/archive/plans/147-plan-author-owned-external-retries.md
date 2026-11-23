# Author-owned external request retries

**Date:** 2026-10-13  
**Status:** Implemented and verified on 2026-10-13

## Agreed behavior

1. Authors control retries inside `external.request`. A recorded producer failure is terminal; a recorded response proceeds through the existing continuation outbox.
2. Delete `nextRunAt` and external-contract `retryDelayMs` outright. Rename `lastProducerFailure` to `producerFailure`; preserve configurable `timeoutMs` and its 30-second default.
3. Pending original production has a child identity and neither a recorded response nor a producer failure. Replay creates no production authority. JSON null remains a valid recorded response.
4. Retain blind recovery when process loss prevents either outcome from being recorded. Provider idempotency and reconciliation belong to the author. Add no started/unknown state or replacement retry framework.
5. Response/outbox and failure settlement use synchronous transactions; the first committed outcome wins. Preserve original and recording Causes when failure recording also fails.
6. Preserve alarm ownership through precommit callbacks, pending requests and recorded child delivery. Keep live reservations until settlement and finalizers finish; prevent stale or overlapping recovery launches.

## Implementation and verification

1. Cut retry fields from canonical author APIs, SystemSpec projection, producer storage and runtime. Regenerate declarations and Explorer schema capture.
2. Keep asynchronous request work and delivery interruptible. Protect terminal settlement and required alarm cleanup; retain existing timeout finalizer settlement.
3. Extend only `scripts/verify-plan140.mjs`, reusing its existing declarations and SQLite setup. Prove bounded author exhaustion stays terminal after alarms/recreation, first-outcome immutability, unfinished recovery, live non-overlap, null success, interruption and alarm handoffs. Preserve existing replay and partial-page delivery checks.
4. Run scoped Nx framework library/lint/type checks, existing Workerd tests, Explorer and relevant example checks. Run the existing standalone inference acceptance and runtime verification, plus scoped formatting and whitespace checks. Create no new tests, fixtures, runners or configuration.
5. Save source-linked research, update affected live documentation and Explorer descriptions, and record the implemented retry-policy tradeoff in an ADR. Preserve addressed-continuation authority in ADR 010.
6. Require empty affected VersionRepo and SystemRepo storage; add no compatibility decode, translation migration or automatic reset. Preserve unrelated release/configuration work.

## References

1. [ADR 010: addressed continuations](../../adrs/010-source-owned-addressed-async-continuations.md) and [ADR 011: author-owned retries](../../adrs/011-author-owned-external-request-retries.md).
2. Existing runtime verification (`scripts/verify-plan140.mjs`, removed 2026-10-17) and [source-linked research](../../research/external-request-retry-ownership.md).
3. [Effect schedules](https://effect.website/docs/v4/scheduling/using-schedules) and [Cloudflare alarms](https://developers.cloudflare.com/durable-objects/api/alarms/).

## Outcome and verification

1. Removed `nextRunAt`, external `retryDelayMs` and the automatic producer-failure loop. `producerFailure` is the terminal marker; response and failure transactions preserve the first durable outcome. Existing alarms and live reservations recover unfinished work without a persisted deadline or new lifecycle state.
2. The scoped Nx library, lint and type graph passed. The follow-up graph passed framework checks, Explorer/Shopping/Tic Tac Toe builds and actual type checks, and all 19 existing Workerd tests across five files. Core/SDK actual `tsc:typecheck` passed with `--skipSync` to preserve the checkout's existing project-reference configuration. Disabled dependency typecheck echo tasks are not claimed as validation. Logs: `/tmp/zerospin-author-retry-framework.log` and `/tmp/zerospin-author-retry-quality.log`.
3. `node scripts/verify-plan140.mjs` passed all eight runtime groups. The extended async group proves authored exhaustion at two attempts, terminal failures across alarms and recreated runners, both first-outcome guards, pending cold recovery, concurrent live non-overlap, null continuation reconstruction, precommit/outbox alarm ownership and interruption/timeout finalizer settlement. Existing replay, addressed admission and partial-page recovery remain covered. Its first run exposed a raw JSON-text assertion; the existing lifecycle decoder fixed the verification helper. Log: `/tmp/zerospin-author-retry-runtime.log`.
4. The existing standalone inference file passed `pnpm exec tsc --ignoreConfig --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --exactOptionalPropertyTypes --types node verification/plan140.ts` from `packages/core`. Log: `/tmp/zerospin-author-retry-inference.log`.
5. The existing static Explorer schema capture regenerated successfully. Formatting of all 23 changed implementation/documentation files and `git diff --check` passed. Independent review found no actionable runtime or API findings. Generated declarations contain none of the removed producer fields/options.
6. Six existing Explorer UI lint warnings and Nx Cloud access code 401 remain; local required checks pass. No new tests, fixtures, runners or configuration were created. No provider call, process-death harness, storage reset, compatibility migration, publication or unrelated release edit was performed.

## Remaining work

None.
