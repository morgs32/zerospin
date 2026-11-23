# AggregateVersionRepo.asyncCommandOutboxHead

**Reviewed:** 2026-10-15

**Status:** Historical review and Plan 187 allocator rename completed. Current name is `externalCommandOutboxHead`; its `singletonId` and `lastAllocatedOutboxIndex` and lifetime high-water semantics remain. Reuse this reasoning with targeted validation of the current external-transfer writer; do not mark the replacement delivery tables reviewed.

**Review queue:** [Plan 151](../../plans/151-plan-storage-table-review.md).

**Recalibration (2026-10-15):** The allocator analysis remains a useful baseline. Refresh current names and transfer dependencies under [ADR 013](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md) when its table is reached.

**Implementation subplan:** [Archived Plan 187](../../archive/plans/187-plan-aggregate-version-repo-async-command-outbox-head.md).

## Verdict and concrete owner

This table preserves the continuation outbox's last allocated enqueue position after pending rows are deleted. Its one logical row belongs to the physical VersionRepo `{ systemId, aggregateId, aggregateName, aggregateVersion }`; separate Repos have independent numbering. No owner, release, receiver or request state belongs on it. [Owner](../../../packages/system-worker/src/AggregateVersionRepo/aggregateVersionRepoName.ts), [shared composition](../../../packages/system-worker/src/AggregateVersionRepo/aggregateVersionRepoDbConfig.ts).

The declaration is shared with ServiceVersionRepo, whose physical owner is
`{ systemId, serviceName, serviceVersion }`. The field rename propagates through
that shared declaration; it does not mark the service-owner occurrence reviewed.
[Service owner](../../../packages/system-worker/src/ServiceVersionRepo/serviceVersionRepoName.ts),
[shared composition](../../../packages/system-worker/src/ServiceVersionRepo/serviceVersionRepoDbConfig.ts).

The maintainer selected numeric FIFO outbox positions in the preceding review. Under that design, the durable head has a precise role: keep allocation increasing across acknowledgement, an empty pending queue and restart. Both current columns serve that role. [Selected outbox plan](../../archive/plans/186-plan-aggregate-version-repo-async-command-outbox.md).

## Every column

| Column                     | Actual purpose and lifecycle                                                                                                                                                                                   | Disposition                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `singletonId`              | Nonnullable integer primary key. The sole production reader/writer uses constant 1 to address this database's allocator row. Immutable once inserted.                                                          | Retain. A structural SQL row address, not another domain identity. |
| `lastAllocatedOutboxIndex` | Nonnullable integer containing the most recently committed allocated `outboxIndex`. Set on first enqueue and advanced on every first recorded observation; never decreased or reset by normal production code. | Retain. It is neither the next position nor acknowledged progress. |

[Declaration](../../../packages/system-worker/src/externalOperations/externalOperationsDbConfig.ts#L47-L53), [sole allocator reader/writer](../../../packages/system-worker/src/externalOperations/makeExternalOperationQueue.ts#L28-L90).

There are two declared columns, no structured JSON subfields and no synthesized application ID. The primary key permits an atomic upsert into the fixed slot. Its constant value has no business meaning; removing it would require another explicit singleton-addressing mechanism rather than eliminate allocation state.

## Absence, allocation and transaction meaning

Fresh provisioning creates this table but does not seed a zero row. Before any successful observation recording, absence represents logical zero. The first allocation inserts `{ singletonId: 1, lastAllocatedOutboxIndex: 1 }`; subsequent first observations advance it to 2, 3 and so on. This is lazy initialization, not missing progress requiring repair.

The only production reader/writer is `recordExternalOutcome`:

1. Read frozen work by stable `continuationCommandId` and return immediately if its first observation already exists.
2. Read allocator slot 1 and calculate `(head?.lastAllocatedOutboxIndex ?? 0) + 1`.
3. Reject an unsafe integer before any new recording writes.
4. Store the first observation, insert its pending continuation at the allocated position, and upsert the head to that same position.

These steps share one synchronous transaction. Encoding/insertion/other step failure rolls observation, pending row and head back together. Failed attempts consume no position, and duplicate recording returns before allocation. Concurrent request completions serialize through this local transaction; no persisted lock, reservation or retry counter is needed. [Recording transaction](../../../packages/system-worker/src/externalOperations/makeExternalOperationQueue.ts), [synchronous transaction ownership](../../../packages/core/src/drizzle/make/makeTx.ts).

Both external Success and Failure observations allocate in the same way. The number describes committed observation-recording/enqueue order. It does not establish provider-effect ordering, initiating command order or the order in which continuation programs finish.

## Why the retained value survives pending delivery

Acknowledgement deletes selected outbox rows only. It never resets or deletes this allocator. Thus pending delivery can be empty while the head remains greater than zero. The next enqueue continues above the previously allocated positions, including after cold activation. [Acknowledgement deletion](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts).

`MAX(outboxIndex)` over pending rows cannot recover that retained high-water value: successfully delivered rows have disappeared. Using it would change the selected lifetime position semantics when the pending set becomes empty or loses its highest rows. This is not a claim that the current serialized queue has a demonstrated stale-acknowledgement deletion bug.

The value is also not the pending-row count, latest admitted/executed command, last delivered position, acknowledgement frontier, timestamp or retry progress. Keep it outside the `acknowledged*` cursor naming convention. The selected name explicitly states allocation and the outbox position domain.

Under today's complete work-retention/first-observation invariants, counting all recorded observations could reconstruct allocation history. That would couple each allocation to lifetime work history instead of a dedicated constant-size allocator. It is not an obvious simplification and supplies no reason to add such a dependency here.

## Bounds and actual constraint ownership

At `Number.MAX_SAFE_INTEGER`, computing the next position is refused with `command-outbox-index-exhausted`. The new observation and pending row remain uncommitted and the head stays unchanged. There is no wraparound or automatic reset.

The singleton and positive-value semantics are currently production-writer conventions, not SQL `CHECK` constraints. The primary key itself does not require `singletonId === 1`; the raw head reader also does not independently validate retained positivity, checking only the computed next value with `Number.isSafeInteger`. Normal writes produce only slot 1 and positive safe positions. No ordinary producer path violating those conventions was found. Do not claim general corruption repair, arbitrary extra-row rejection or stronger validation than the source supplies.

This is a precise statement of existing ownership, not a proposal for additional fields, repair state or validation infrastructure. The current review found no reachable allocation defect.

## Selected names and review limits

```ts
{
  singletonId: number; // allocator slot 1
  lastAllocatedOutboxIndex: number;
}
```

Two independent planning reviewers traced both fields, first/duplicate recording, atomic rollback, integer exhaustion, deletion, restart and the sole production reader/writer. The primary agent checked the source against the chosen numeric outbox protocol. That initial review used source only; implementation verification is recorded in Plan 187.

Planning-review baseline, before the selected field rename: commit `3b2d1e7d19ea9fd49ef39ec0c9dec06a30d93260`. Shared declaration SHA-256: `aa50ad9d6ad64721960a985559e4adec00060f5ca9c2e2d14323157003a8e226`; recording implementation SHA-256: `554eb91fd52154ae60e3968415adad3d76dd5327ba8d0fc0a037b82e4d65f9b0`.

Plan 187 completed the selected naming change and independent implementation review. Existing acceptance and Workerd seams verify lazy allocation, lifetime history, duplicates, rollback, exhaustion, explicit cold activation and both owners' refusal of the old column shape. Changed fixed storage requires empty affected storage, with no translation, compatibility decoder or automatic reset; no application storage was reset. The preceding outbox plan preserved the allocator's allocation semantics. Model output is recorded separately in the [modelOperations review](aggregate-version-repo-model-operations.md).
