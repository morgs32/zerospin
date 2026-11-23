# ServiceChain command storage

**Date:** 2026-10-15

**Status:** Implemented and verified; archived 2026-10-15.

**Parent:** [Plan 151 — storage table review](../../plans/151-plan-storage-table-review.md).

**Evidence:** [ServiceChain.commands review](../../reviews/storage-tables/service-chain-commands.md).

## Problem and intended result

ServiceChain stores its containing service name on every command, combines retained actor authority with browser submission metadata in `caller`, and persists a delivery diagnostic that does not control command progress.

Derive the service owner from the Chain, retain explicit Origin independently of the producer tuple, and remove the diagnostic. Preserve the already implemented `externalOutcome` and `commandOutcome` semantics from [Plan 152](152-plan-aggregate-chain-command-storage.md).

## Settled row and Origin model

The stored command has exactly these twelve fields:

```ts
{
  id: string;
  commandName: string;
  payload: string;
  externalOutcome: IExternalOutcome | null;
  contractVersion: string;
  serviceVersion: string;
  origin: IActorOrigin | ISystemOrigin;
  nodeId: string | null;
  sessionName: string | null;
  pushIndex: number | null;
  serviceIndex: number;
  commandOutcome: ICommandOutcome | null;
}
```

Retain the existing outcome codecs and recording-time semantics. All admission/position fields are immutable. `commandOutcome` transitions from absent to the first acknowledged original result and rejects contradictory repeats.

Use the agreed canonical Origin vocabulary:

```ts
type IActorOrigin = {
  kind: 'actor';
  actorName: string;
  actorVersion: string;
  claims: Record<string, unknown>;
};
type IAgentOrigin = {
  kind: 'agent';
  agentName: string;
  agentVersion: string;
};
type ISystemOrigin = { kind: 'system' };
```

1. Remove `serviceName` from this Chain's stored rows. Reconstruct complete transported occurrences from `{ systemId, serviceName }` and the retained row. Keep receiving-owner validation and owner identity wherever independently needed by transport or another repository.
2. Replace `caller` with required, nonnullable `origin`. System authority is `{ kind: 'system' }`; null does not mean System. Preserve exact actor name/version and complete claims.
3. Keep `nodeId`, `sessionName` and `pushIndex` as three separate nullable row fields. Together they must be all-null or fully populated. Browser submissions require actor Origin and the complete tuple. Existing privileged actor submissions may lack a producer; System commands and recorded external continuations have an all-null tuple. Continuations retain frozen Origin without reusing the initiating browser command's submission position.
4. Reuse canonical Origin definitions across families without duplicating schemas under new spellings. Aggregate commands support actor/agent/System. Current service declarations and ingress support actor/System, with no service agent registry; preserve that capability boundary. The shared Agent definition does not introduce service agents or agent sessions. If a common three-variant union is used internally, service ingress and retained execution must explicitly reject unsupported Agent authority.
5. Remove `lastDeliveryFailure`, its initialization, writes and acknowledgement clearing. Add no replacement field, table, persisted error state, retry counter or pause gate. Failures remain observable through the existing logging/invocation path; future log alerts are separate work, not an alert-provider deployment in this subplan.

## Required propagation

- **Row and transport:** ServiceChain DB config, admission, exact retry recovery, original delivery, replay paging, acknowledgement and VersionRepo interfaces currently tied to `commands.$inferSelect`. Keep the row type distinct from the complete owner-qualified occurrence.
- **Command boundaries:** core service command/executed/async schemas and constructors, validation, service socket protocol, browser ServiceNode synchronization, actor socket admission, CLI/admin/seed constructors and affected first-party consumers. Delete `ServiceCallerSchema` once its actual consumers are cut over; keep no alias or nullable fallback.
- **Execution and continuations:** ServiceVersionRepo journal/occurrence decoding, identity checks, authority/guard resolution, original/replay result retention, external-work preparation and recorded-child reconstruction/proof. Preserve exact frozen Origin, producing contract lineage and both structured external outcome branches.
- **Private completion:** service projection, selected browser-command retention, broadcast filtering and private result paging currently read the combined caller. Carry the separate Origin/producer representation through required consumers, including any changed fixed-schema codec. Preserve actor name/version, full claims, Node and session checks. Keep authority/recipient metadata out of public browser output. This is representation propagation, not a redesign of projection identities or cursors.
- **Outbox:** remove ServiceChain's diagnostic writer. The shared `makeOutboxQueue` currently requires a `lastDeliveryFailure` column and custom `recordFailure` even with explicit storage. Remove that requirement for owners that omit diagnostic persistence; core `makeOutboxDelivery.recordFailure` is already optional. Keep diagnostic requirements only on paths that actually store diagnostics. Add no fake column, no-op storage writer or compatibility path. Preserve other owners' existing diagnostic behavior pending their reviews.
- **Docs and schema consumers:** reconcile affected module READMEs, architecture/glossary, Origin consumer documentation, local patterns and Explorer schema/purpose descriptions. Do not imply every queue's diagnostic was removed.

Keep the existing direct-service result interface and its retained VersionRepo lookup. This cleanup does not authorize changing result ownership, adding a Chain disposition hash, a return-version argument or new service authorization capabilities.

## Transaction and recovery requirements

1. Validate the complete owner-qualified page before its ordered synchronous admission transaction. Recover exact retained IDs before checking current declarations; compare frozen Origin, producer tuple, raw input, release and external observation without normalization.
2. Preserve consecutive Node `pushIndex`, immutable producer context and service-wide `serviceIndex` allocation in the same transaction. A later refused entry rolls back earlier new entries in its page. System authority cannot be inferred from a missing Node.
3. Deliver the oldest pending original to its retained `serviceVersion`. Infrastructure failure keeps it pending and preserves alarm recovery; committed business refusal settles the command and allows later originals. Removing a diagnostic must not swallow a failure or its complete Cause.
4. Original VersionRepo materialization and local outcome retention remain atomic. Chain acknowledgement separately verifies complete identity and copies the committed original outcome, including `recordedAt`, unchanged. Lost replies recover committed results without reevaluation.
5. Replay retains its own release-specific evaluation and exposes only the contiguous original-acknowledged prefix. It neither produces external work nor replaces the Chain's original outcome. Preserve private completion ownership after relocating fields.

## Implementation and verification

1. Introduce/reuse the canonical Origin definitions and cut the service command schemas, row and owner-qualified occurrence types to the settled model.
2. Propagate admission, Node continuity, original/replay/async execution and private completion consumers together. Remove superseded caller paths outright.
3. Remove service diagnostic persistence and its unnecessary shared outbox requirements while preserving failure reporting and durable recovery.
4. Reconcile documentation/Explorer, run permitted existing scoped Nx checks and behavioral seams, and obtain independent ownership/privacy/recovery review.

Use existing tests, profiles, Workerd acceptance seams and runners only. Create no new test files, fixtures, runners or configuration. Required evidence covers owner reconstruction and wrong-owner refusal; exact retry versus contradictory Origin/tuple/input; System and actor authority; all-or-none tuple and producer continuity; frozen recorded children; private completion isolation; original outcome immutability and lost-ack recovery; replay isolation; and failure/alarm recovery without SQL diagnostic writes. Report missing existing evidence as unfinished work rather than inventing prohibited infrastructure.

Changed fixed schemas/codecs require empty affected storage. Refuse incompatible storage; add no translation migration, alias, fallback decoder or automatic reset. No storage reset is authorized here.

## Implementation outcome

- ServiceChain retains exactly the settled twelve fields. `readServiceCommandOccurrence` restores service ownership from the bound Chain; original delivery, replay and acknowledgement transport or compare the complete decoded occurrence independently of the stored row type.
- Canonical actor, agent and System Origin definitions are shared across families. Service command, executed-command, browser socket and async codecs admit actor/System only; actor submissions may omit a producer, browser submissions require a complete producer, and continuations retain frozen Origin with an all-null tuple. `ServiceCallerSchema` and its consumers are removed.
- Ordered page admission retains raw encoded input, immutable Origin/producer context and consecutive producer/service positions atomically. Exact retries recover before current declaration checks. Original materialization and local outcome retention remain atomic; acknowledgement preserves the committed first outcome and recording time, and replay consumes only the original-acknowledged prefix without generating external work.
- Service projection and private completion use Origin and separate producer fields. Full claims, actor name/version, Node and session govern private delivery; retained partial tuples are refused, and public frames contain no authority or producer metadata.
- ServiceChain no longer stores or writes delivery diagnostics. Explicit outbox storage can omit its diagnostic writer; default storage and other owners retain their existing diagnostics. Failures retain their complete Cause and pending work remains recoverable by alarm.
- Module documentation, architecture/glossary, Origin consumer guidance, local patterns and Explorer are reconciled. The Explorer capture contains nine concrete Repo schemas and fifty tables.

## Verification evidence

- Passed the existing Nx graph: `pnpm nx run-many --targets=lib,ts,lint,test-workerd-ts --projects=@zerospin/core,system-worker,@zerospin/browser,@zerospin/cli,explorer,shopping --parallel=1 --outputStyle=static` (28 tasks including dependencies). Existing unrelated lint warnings remain; Nx Cloud returned an access warning after successful local tasks.
- Passed the existing scoped Workerd suites: `pnpm nx run system-worker:test-workerd -- test/migratable-do-repo/system-repo-activation.workerd.spec.ts test/telemetry/invocation-order.workerd.spec.ts` (two files, eight tests). These exercise real owner activation, the twelve-column service layout, receipts across cold restart, release-specific replay refusals and recovery, plus failure capture/alarm recovery without diagnostic SQL.
- Passed `node scripts/verify-plan140.mjs` (eight groups). Extended existing seams prove owner reconstruction and wrong-owner execution/ack refusal; exact retries and contradictory Origin/producer/raw input refusal; actor/System authority and Agent rejection; all-or-none producer validation, Node continuity and complete page rollback; frozen recorded actor children and both external outcome branches; original business refusal, immutable recording time and lost-reply recovery; replay isolation/finalized prefix; combined failure/defect Cause and alarm recovery with no diagnostic writer; and private SQL paging with exact full claims, actor/version, Node/session, metadata exclusion and corrupted-tuple refusal.
- Passed `node scripts/verify-session-identity.mjs` (six groups), including private-filter tuple refusal and explicit exclusion of authority/producer fields from browser output. Existing runner assertions use structured error codes where descriptive messages changed.
- Independent command-boundary, ownership, privacy and recovery reviews found no remaining actionable defects. The retained private-result tuple-validation finding was fixed and exercised through existing runners. Scoped formatting and `git diff --check` passed. No test files, fixtures, runners or configuration were created.

Verification records the completed service-command cutover. Concurrent Plan 158 subscriber-table edits began appearing during final cleanup; their implementation and verification remain separate from this child.

An additional, nonrequired `tic-tac-toe:ts` check failed in unrelated native aggregate-session integration: missing `expectedNodeId`, `originatingCommands` and verified-admission fields in `packages/native`. Those aggregate-only paths are outside this service storage cutover and remain untouched by this plan.

Changed affected fixed storage remains incompatible and requires empty storage. No translation migration, fallback decoder, compatibility path or existing application storage reset was introduced or performed. The parent table review remains active.

## Remaining work

None.
