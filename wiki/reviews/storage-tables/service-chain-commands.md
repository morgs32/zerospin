# ServiceChain.commands

**Reviewed:** 2026-10-14

**Status:** Source review complete. The selected owner reconstruction, explicit Origin with separate producer fields, and removal of delivery diagnostics are implemented under the child plan, which tracks verification and remaining work.

**Review queue:** [Plan 151](../../plans/151-plan-storage-table-review.md).

**Implementation subplan:** [Plan 157](../../archive/plans/157-plan-service-chain-command-storage.md).

**Selected follow-up:** remove stored `serviceName`; replace `caller` with `origin` and the separate all-or-none `nodeId`/`sessionName`/`pushIndex` tuple; remove `lastDeliveryFailure` in favor of logging and future alerts. Preserve the complete original/external outcomes. The source snapshot below records the reviewed representation before this cleanup.

## Implemented representation

The command row now contains exactly `id`, `commandName`, `payload`,
`externalOutcome`, `contractVersion`, `serviceVersion`, required `origin`,
nullable `nodeId`, `sessionName`, `pushIndex`, `serviceIndex` and `outcome`.
The Chain key supplies service ownership when reconstructing complete occurrences.
Origin retains the admitted Actor, Agent or System authority. The
producer tuple remains all-null or complete independently of Origin, and recorded
children clear it while retaining frozen authority. Original acknowledgement
verifies the complete owner-qualified input and preserves the first outcome and
its recording time. ServiceChain has no delivery diagnostic column or writer;
other queues retain their existing diagnostic behavior. Changed affected fixed
schemas require empty storage, with no decoder fallback, migration or reset.

**Producer uniqueness amendment (2026-10-22):** `commands_node` now uniquely
constrains `(nodeId, pushIndex)`, matching AggregateChain. Distinct command IDs
cannot reuse a non-null producer position; null/null producer coordinates remain
valid for multiple commands. Transactional producer continuity and complete retry
comparison remain unchanged. This fixed-schema cutover requires empty affected
ServiceChain storage; no reset was authorized or performed. Verification passed:
source build/typecheck/lint, shared test typecheck and 53 focused runtime cases,
including actual SQLite index metadata, duplicate rejection without row changes,
independent Node positions and multiple null producers.
See the [current table declaration](../../../packages/system-worker/src/ServiceChain/serviceChainDbConfig.ts).

## Reviewed pre-cutover snapshot

One reviewed row retained an immutable admitted service input in service-wide order, then its acknowledged original command outcome and latest original-delivery diagnostic. That schema had 11 columns: nine immutable admission/position facts and two mutable acknowledgement/diagnostic fields.

The source changed during this audit as [Plan 152](../../archive/plans/152-plan-aggregate-chain-command-storage.md) progressed. The recorded snapshot uses `externalOutcome` and `commandOutcome`, with structured success/failure observations and recording times. Early transitional reads of `response`/`finalization` are not findings about the final snapshot. This review does not claim that the concurrent cutover compiles or passes its runtime checks.

The strongest findings were owner-redundant `serviceName` and `caller`, which combined two independent responsibilities: frozen actor authority and optional originating producer metadata. Full original outcomes and structured external observations follow the already-settled design; there is no reason to reopen cursor/digest alternatives or report the old successful-null ambiguity as current behavior.

## Owner and row lifecycle

The containing Chain key is `systemId / serviceName`. Its command order spans service releases. `serviceVersion` retains original execution/source authority; another VersionRepo can replay the same shared history with its own program. [Owner declaration](../../../packages/system-worker/src/ServiceChain/serviceChainName.ts#L7-L10).

Ordinary admission validates the bound owner and forbids external observations, then one synchronous page transaction recovers exact IDs or validates/appends new commands. A later page refusal rolls back all new occurrences. Recorded admission separately proves frozen external continuations against the originating VersionRepo before local retention. [Ordinary ingress](../../../packages/system-worker/src/ServiceChain/admitServiceCommands/admitServiceCommands.ts), [transaction](../../../packages/system-worker/src/ServiceChain/admitServiceCommands/admitServiceCommandsTx.ts), [recorded ingress](../../../packages/system-worker/src/ServiceChain/admitExternalCommands/admitExternalCommands.ts).

## Every column

| Column                | Actual purpose and lifecycle                                                                                                                                               | Disposition                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `id`                  | Unique immutable command identity. Exact retries recover their retained receipt before consulting current declarations.                                                    | Retain. Identity differs from service-wide order.                                             |
| `commandName`         | Immutable selector for the ordinary command or external continuation declaration. Execution/replay resolves the implementation in its release.                             | Retain.                                                                                       |
| `caller`              | Frozen actor definition/version and claims, plus optional Node/session/submission position. Null explicitly means System authority. Immutable.                             | Replace with required Origin and separate producer fields; System Origin is explicit.         |
| `payload`             | Exact encoded input string. Immutable; retry compares bytes, and execution decodes/adapts against retained contract lineage.                                               | Retain; document encoded input and do not normalize it during admission.                      |
| `externalOutcome`     | Frozen external observation supplied as continuation input: success/content or external request failure, plus `recordedAt`. Null means no external observation. Immutable. | Retain the selected structured representation. Successful JSON null is distinct from absence. |
| `contractVersion`     | Exact submitted payload version or producing external declaration version. Immutable; not inferred generally from the service release.                                     | Retain.                                                                                       |
| `serviceName`         | Service owner name, required to equal the containing Chain key. Immutable; the current row doubles as its transport envelope.                                              | Derive from the bound Chain for transport rather than persisting a repeated owner constant.   |
| `serviceVersion`      | Original/source release. Immutable; selects original execution and originating continuation proof while other versions replay with their own implementations.              | Retain. Never substitute the latest release.                                                  |
| `serviceIndex`        | Contiguous positive safe service-wide admission position, allocated synchronously. Immutable primary key; orders originals, replay and acknowledgement.                    | Retain. Distinct from producer `pushIndex`.                                                   |
| `commandOutcome`      | First acknowledged original success/result or public failure with its recorded time. Starts null; conflicting repeated outcomes are rejected. Its presence enables replay. | Retain the already-settled complete original outcome.                                         |
| `lastDeliveryFailure` | Latest original-delivery/acknowledgement diagnostic while pending. Starts null, can be overwritten, clears upon acknowledgement.                                           | Remove. Preserve failure logging and recovery; future log alerts replace SQL inspection.      |

[Definition](../../../packages/system-worker/src/ServiceChain/serviceChainDbConfig.ts#L11-L38), [append](../../../packages/system-worker/src/ServiceChain/admitServiceCommands/appendServiceCommand.ts), [exact recovery](../../../packages/system-worker/src/ServiceChain/admitServiceCommands/readRetainedServiceCommand.ts), [acknowledgement](../../../packages/system-worker/src/ServiceChain/acknowledgeCommand.ts#L23-L66).

## Structured column meanings

### Caller authority and producer tuple

`caller` has three legitimate states:

```ts
null // known System authority
{ actorName, actorVersion, claims, nodeId: null, sessionName: null, pushIndex: null }
{ actorName, actorVersion, claims, nodeId, sessionName, pushIndex }
```

Each field has a concrete role:

- `actorName` and `actorVersion` retain the originating actor declaration/permission identity.
- `claims` retain complete invocation authority and identity input for admission, guards and private completion ownership.
- `nodeId` identifies the durable originating producer, not a socket connection.
- `sessionName` identifies its declared session definition, not a session instance.
- `pushIndex` is that producer's consecutive originating submission position, independent of service-wide admission order.

The producer tuple must be either fully populated or all-null. An actor continuation retains the actor/claims and deliberately clears the tuple; its immediate delivery is from a VersionRepo, but its authority remains the originating actor. Therefore `caller.nodeId === null` does not mean System authority. [Caller schema](../../../packages/core/src/contracts/ServiceCommandOriginSchema.ts), [continuation reconstruction](../../../packages/system-worker/src/externalOperations/readPreparedExternalCommand.ts).

### External and command outcomes

`externalOutcome` is input to a continuation; `commandOutcome` is the command program's terminal output. Each carries its own recorded observation time. The successful external branch can contain `success: null`, so it remains distinguishable from the column's absent null. External failure records that the request stopped without a usable response; it is not proof that a remote side effect never happened. [External schema](../../../packages/core/src/contracts/ExternalOutcomeSchema.ts), [command schema](../../../packages/core/src/contracts/CommandOutcomeSchema.ts).

The ServiceChain copies the original VersionRepo's committed command outcome, including recording time, unchanged. Replay can calculate its own local outcome without replacing the Chain's original outcome. `lastDeliveryFailure` instead records uncertainty about delivery or acknowledgement and cannot turn a committed business result into a different terminal result.

## Findings

### 1. `serviceName` is an owner constant stored for envelope convenience

Ordinary and recorded ingress check the complete submitted owner identity against the bound Chain. All rows then repeat that same name. Downstream occurrence validation and declaration lookup need the name, but they do not prove a need to persist it per row. [New input/owner checks](../../../packages/system-worker/src/ServiceChain/admitServiceCommands/admitServiceCommands.ts), [receiving-owner check](../../../packages/system-worker/src/ServiceVersionRepo/utils/readServiceOccurrenceTx.ts#L26-L33).

**Recommendation:** remove `serviceName` from this Chain's stored rows and reconstruct complete owner-qualified commands from the bound key at admission-receipt, original-delivery, replay and acknowledgement seams. Preserve receiving-owner checks. Decouple the delivered command type from `$inferSelect`; do not delete service identity from transported commands or other owners' storage merely to remove this one redundant column.

### 2. `caller` hides authority and submission provenance in one object

The three authority fields survive recorded continuation delivery while the three producer fields disappear. That demonstrates independent lifecycles, not two spellings of one fact. `caller` also suggests the immediate RPC invoker, which is not what recorded actor continuation provenance means. [Frozen service output origin](../../../packages/system-worker/src/ServiceVersionRepo/utils/prepareServiceOutput.ts#L34-L47), [actor admission](../../../packages/system-worker/src/ServiceChain/admitServiceCommands/validateNewServiceCommand.ts#L22-L38).

**Selected design:** tagged service command `origin` plus the separate producer tuple, following the settled Origin vocabulary. Current service authority supports actor and System variants; a shared name does not authorize adding service-agent ingress. Preserve System-without-producer and actor continuation-without-producer rules. This produces more SQL columns while giving each a clearer responsibility; column count alone is not the architectural goal.

Do not merely rename the combined object and leave its responsibilities hidden. Plan 157 retains three producer fields outside Origin and preserves their all-or-none relationship.

### 3. Producer continuity is enforced transactionally; JSON lookup is a storage trade-off

New producer commands find the latest occurrence for `caller.nodeId` using JSON extraction, require exactly the next safe `pushIndex`, and prohibit changes to service release, actor definition/version, session or claims. Validation and append share the same ordered synchronous transaction, so later batch entries see earlier retained occurrences. [Continuity](../../../packages/system-worker/src/ServiceChain/admitServiceCommands/validateServiceNodeContinuation.ts#L18-L58), [ordered transaction](../../../packages/system-worker/src/ServiceChain/admitServiceCommands/admitServiceCommandsTx.ts).

There is no dedicated producer uniqueness index in this table, but that does not establish a correctness defect: a fresh ID at a consumed producer position is refused, and a retained ID must match complete input. The JSON query exposes the authority/producer storage coupling. Any index recommendation needs an actual query/behavior requirement; do not add duplicate producer state or counters by habit.

### 4. `lastDeliveryFailure` serves durable inspection, not command progress

The original outbox writes the latest failure onto the still-pending command; acknowledgement clears it. Pending selection instead checks `commandOutcome === null`. No retry, ordering or acknowledgement decision consults the diagnostic's contents. Whole-row delivery carries it incidentally; that is not an independent correctness requirement. [Outbox storage](../../../packages/system-worker/src/ServiceChain/ServiceChain.ts), [acknowledgement](../../../packages/system-worker/src/ServiceChain/acknowledgeCommand.ts).

Its defensible purpose is inspecting the latest delivery failure after interruption or restart. The maintainer chose to remove that convenience and use log alerts instead. Plan 157 removes persistence while preserving failure reporting, pending commands and alarm recovery; configuring future alerts is separate work. No retry gate replaces the diagnostic.

### 5. Direct original-result retrieval and version-specific replay results differ

The current `SystemApi.executeServiceCommand` accepts `{ command }`. Its helper admits once, validates the receipt and awaits exactly `receipt.serviceVersion`. There is no separate return-version argument on that direct command interface. [System method](../../../packages/system-worker/src/SystemApi/executeServiceCommand/executeServiceCommand.ts), [direct helper](../../../packages/system-worker/src/executeDirectServiceCommand/executeDirectServiceCommand.ts#L26-L47).

A separately addressed VersionRepo's `awaitCommandResult` can progress originals, catch up its own replay and return that release's materialized result. That different capability does not turn its replay outcome into the Chain's original outcome. [Version result capability](../../../packages/system-worker/src/ServiceVersionRepo/awaitCommandResult/awaitCommandResult.ts).

The README's broad requested-return-version sentence needs to name that capability or be narrowed to the actual direct interface. Do not invent a command argument or stored column to satisfy ambiguous documentation. If service original-result retrieval moves to its retained Chain outcome, propagate its interface/callers explicitly while keeping version-specific result/hash responsibilities separate.

## Transaction and recovery requirements

1. Decode the complete input page and bound identity, then recover duplicates or validate/append new occurrences in one synchronous transaction. Current catalog removal cannot redefine an exact retained receipt.
2. Deliver the oldest pending original to its retained source service version. Infrastructure failure preserves the occurrence and blocks later originals; a committed refusal settles it and permits progress. External work owns a separate postcommit lifecycle.
3. Original VersionRepo materialization and result retention are atomic. Chain acknowledgement is a separate transaction that verifies immutable occurrence identity and outcome, stores the original outcome and clears its diagnostic. Lost replies recover committed results without reevaluation.
4. Expose only the contiguous original-acknowledged replay prefix. Receiving versions evaluate their own programs without producing external work or rewriting the Chain's original observation.
5. Private completion matches retained actor/claims and Node/session ownership. Removing or relocating caller fields must preserve those checks and independent producer/service-wide positions.

## Evidence and verification limits

Two independent reviewers traced all 11 columns, all six caller fields, admission, continuation proof, original acknowledgement, replay and result recovery. The primary agent reconciled their conclusions with the latest outcome schemas. No tests or source edits were performed by this review, and no concurrent implementation verification is claimed.

Base commit: `7c98a5fcd7099dd965395a33b695d6b15a62a77d`. Current table-definition SHA-256: `42058f7312b444972280cc963c61f2a6291343009b88a25960b2917298424e67`; caller-schema SHA-256: `48a1b2132969cf835962b2b0e62062a324e9acab2a3ce267502f089f87f08ce9`. Source names and line numbers can change during the ongoing cutover; recheck before implementing these recommendations.

Implement and verify the selected changes through Plan 157. No implementation or runtime verification was performed by this review.
