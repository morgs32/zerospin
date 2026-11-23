# Plain admitted-command arrays and one final outcome

Status: Complete. Approved and verified on 2026-10-09.

## Decisions

1. `admitAggregateCommands` returns `IAdmittedAggregateCommands`, a readonly array of complete retained encoded inputs plus their original `aggregateIndex`. No ZerospinSuccess or result wrapper.
2. Durable ordering proves admission. Remove per-command admission status, timing, schema, storage, and browser fields across aggregate and service consumers.
3. Intake validation and transaction failures fail the batch without a retained new prefix. Duplicates recover original inputs, version, and position.
4. Preserve only trusted nullable aggregate `stagingFailure` evidence. Materialization turns it into the sole final failed execution result, retaining the original public failure and emitting no operations.
5. Receipts acknowledge identities and positions; final execution output settles optimism. Preserve completion privacy, synchronous transactions, hashes, and interruption recovery.
6. Fixed-schema hard cutover requires empty storage. No compatibility paths or migration.

## Implementation and verification

1. Update admission procedures, chain storage, materializers, shared command schemas, projections, fanout/outbox acknowledgement, browser/agent receipts, Node/session journals, standalone outputs, native observers, and Studio status.
2. Verify empty/new/mixed/duplicate arrays, late validation and SQL rollback, saved refusals after guards change, lost receipts, optimism until final output, failure notification deduplication, aggregate/service hashes, and private completions.
3. Run existing Nx aggregate administration and outbox checks, core/browser Node tests, and scoped type/lint checks for affected packages.
4. Reconcile lifecycle docs, module READMEs, patterns, and glossary with implementation; write an ADR only if repository criteria warrant it. Archive this plan after all required verification passes.

## Outcome

1. Admission returns complete plain arrays; intake rejects invalid new batches atomically, and retries recover the original command and position. AggregateChain saves only trusted nullable stagingFailure evidence, which never enters its returned array or browser receipts.
2. Saved staging refusals commit as the original final execution failure without guards, programs, or operations. Final storage and transport accept only succeeded or failed execution. Hashes derive failure from that final execution outcome.
3. Browser and agent receipts acknowledge identity and positions while optimism remains pending. Committed final output settles optimism and reports originating failures once, including snapshot recovery; nonowners receive execution: null. Native observers, Studio, devtools, standalone execution, and Shopping consumers follow the same final outcome.
4. Removed AdmissionResultSchema and its helper, command admission fields, and skipped execution outcomes. Lifecycle documentation, module READMEs, local patterns, and glossary match the implementation. No new ADR was warranted. Start this fixed-schema revision with empty affected server and browser storage; no compatibility decoder or migration is supplied.

## Verification

1. Existing aggregate-administration:check and outbox:check pass, including atomic batch rollback, original duplicate recovery, permanent staging refusals, final-only codecs, private outcomes, and lost-ack recovery.
2. Core Node tests pass 35/35; browser Node tests pass 67/67, including receipt-only pending optimism, final-failure reconciliation and once-only notification, agent snapshot recovery, and silent duplicate/historical outcomes.
3. Nx type/lint checks pass for core, browser, system-worker, native, Studio, devtools, and Shopping. Existing core lint reports four warnings and zero errors. Shopping checks passed after dependency build outputs were stable. Nx Cloud access returned 401 without preventing local checks.
4. Scoped formatting, source-link paths and bounds, updated source hashes, relevant sequence message/annotation alignment, and git diff --check pass. Unrelated checkout work is preserved.

## Remaining work

None.
