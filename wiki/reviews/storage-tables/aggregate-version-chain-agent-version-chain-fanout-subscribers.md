# AggregateVersionChain.agentVersionChainFanoutSubscribers

**Reviewed:** 2026-10-15, after completed [Plan 203](../../archive/plans/203-plan-aggregate-version-chain-agent-fanout.md) and [Plan 204](../../archive/plans/204-plan-aggregate-actor-fanout-subscriber-identity.md). Exactly this physical subscriber table was reviewed; retained commands, projection state and the shared queue were dependencies.

**Verdict: retain durable enrollment and source acknowledgement; use three domain columns.** Store non-null `agentName`, `agentVersion` and `acknowledgedAggregateIndex`, with composite uniqueness over the agent name/version pair. Reconstruct the complete AggregateAgentVersionRepo key from that pair and AggregateVersionChain's bound owner. Store no full Repo name, packed substitute, hash, synthetic ID or actor path.

**Decision status:** The three-column model is implemented and verified in [Plan 206](../../archive/plans/206-plan-aggregate-agent-fanout-subscriber-identity.md). The table and queue binding use the existing structured-identity API. Authored-agent availability and retirement policy remain outside this cutover.

**Review queue:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Architecture:** [ADR 013](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md), [ADR 014](../../adrs/014-synchronous-original-finalization.md) and [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md).

## Physical scope and represented fact

AggregateVersionChain fixes `systemId / aggregateId / aggregateName / aggregateVersion`. That `aggregateVersion` identifies the evaluating release, independently of a retained command's original admission release. One row says that an exact AggregateAgentVersionRepo projection is enrolled, and that AggregateVersionChain knows it committed through an inclusive Aggregate command position.

The row is **subscriber membership plus source acknowledgement**. It is neither a pending command payload nor a registry of authored agents, browser connections, sessions or materialized resources. Both Aggregate fanout queues read permanent `commands`; their acknowledgements never delete that history.

- [Source owner](../../../packages/system-worker/src/AggregateVersionChain/aggregateVersionChainName.ts#L5-L9), [current table declaration](../../../packages/system-worker/src/AggregateVersionChain/aggregateVersionChainDbConfig.ts#L27-L41), [agent queue binding](../../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts#L118-L154).

## Current three-column model

| Column                       | Meaning, null rule and mutability                                                                                                                             | Writer and reader                                                                                                                                                                | Finding and removal consequence                                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `agentName`                  | Non-null authored agent name; immutable within one enrolled identity.                                                                                         | Enrollment extracts it from the complete AggregateAgentVersionRepo key. Composite conflict handling, lookup, acknowledgement and bounded selection match it with `agentVersion`. | Necessary variable identity; removing it conflates different authored agent projections.                                                                                                                                                               |
| `agentVersion`               | Non-null exact authored agent version; immutable within one enrolled identity.                                                                                | The same structured identity binding uses it with `agentName` and reconstructs the full key from the bound AggregateVersionChain owner.                                          | Necessary variable identity; removing it conflates distinct definitions and private completion ownership.                                                                                                                                              |
| `acknowledgedAggregateIndex` | Non-null inclusive command position whose AggregateAgentVersionRepo receipt AggregateVersionChain retained. Enrollment and receipts advance it monotonically. | Enrollment upserts `max(existing, reported)`; successful delivery applies `max(existing, delivered)`. Selection compares it with a fixed committed source tip.                   | Necessary durable scheduling progress. It can lag AggregateAgentVersionRepo materialization after a lost receipt and does not prove AggregateAgentVersionChain publication. Removing it requires replay from zero or another remote-progress protocol. |

The agent name/version pair is unique together. There is no full physical Repo
name, packed replacement ID, synthetic column, timestamp or actor path. Primitive
defaults make all three columns non-null; the supported subscription boundary
requires a nonnegative safe integer no greater than the committed source tip.
The queue RPC still calls this reported cursor `currentIndex`.

- [Identity conversion](../../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts#L133-L153), [enrollment bounds](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L466-L509), [monotonic SQL writes](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts#L177-L205).

## Original two-column review (historical)

Before Plan 206, the physical table had the following two declared columns. This
section preserves the design review that led to the cutover; these are no longer
the implemented fields.

| Column                          | Meaning, null rule and mutability                                                                                                                                   | Writer and reader                                                                                                                                                                      | Finding and removal consequence                                                                                                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aggregateAgentVersionRepoName` | Non-null text primary key containing the canonical full physical AggregateAgentVersionRepo name. Immutable for an enrolled identity.                                | Enrollment encodes the complete key. Selection reads it; delivery decodes it to acquire AggregateAgentVersionRepo; conflict handling and acknowledgement match it.                     | The recipient identity is necessary; repeating the containing Chain's identity and component prefix is not. Replace the packed name with the variable agent pair. Removing identity entirely conflates independently materialized projections. |
| `currentIndex`                  | Non-null integer, initialized from AggregateAgentVersionRepo's reported committed progress. Advances monotonically through enrollment and successful page receipts. | Enrollment transaction upserts `max(existing, reported)`; successful delivery transaction applies `max(existing, delivered)`. Selection compares it with a fixed committed source tip. | The fact is necessary, but the name hides its owner and meaning. Rename the SQL field to `acknowledgedAggregateIndex`. Removing progress loses durable scheduling knowledge, requiring replay from zero or a new remote-progress protocol.     |

The original table had exactly two declared columns and no framework-added model ID, timestamp, discriminator or structured JSON member. These were infrastructure `makeTable` fields, not an authored model declaration. Primitive defaults made both non-null; SQL added no separate range constraint.

- [Table shape capture](../../../packages/shapes/src/makeTable.ts#L72-L108), [integer defaults](../../../packages/shapes/src/primitives.ts#L184-L210), [text defaults and primary key](../../../packages/shapes/src/primitives.ts#L328-L350).

### Components formerly packed into the name

| Component                     | Necessity in this table                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `aagr_` component prefix      | AggregateAgentVersionRepo is already fixed by this queue's `getRepo` binding. The name utility needs the prefix at the lookup boundary; the row does not need another recipient-kind fact. |
| `systemId`                    | Fixed by the containing AggregateVersionChain; reconstruct it.                                                                                                                             |
| `aggregateId`                 | Fixed by the containing AggregateVersionChain; reconstruct it.                                                                                                                             |
| `aggregateName`               | Fixed by the containing AggregateVersionChain; reconstruct it.                                                                                                                             |
| evaluating `aggregateVersion` | Fixed by the containing AggregateVersionChain; reconstruct it from that owner, never from a retained command's original admission release.                                                 |
| `agentName`                   | Necessary variable identity. Different authored agents can select different views of the same Aggregate release.                                                                           |
| `agentVersion`                | Necessary variable identity. Exact versions select distinct definitions and private completion ownership; the registry does not constrain an Aggregate release to one version per agent.   |

- [Complete recipient key](../../../packages/system-worker/src/AggregateAgentVersionRepo/aggregateAgentVersionRepoName.ts#L7-L15), [physical abbreviation](../../../packages/system-worker/src/systemWorkerAbbreviations.ts#L7), [canonical name encoding](../../../packages/system-worker/src/makeDORepo/makeRepoNameUtils.ts#L64-L82).
- [Agent registry validation](../../../packages/core/src/system/make/makeSystem/validateAgentReleases.ts#L14-L39), [exact agent selection](../../../packages/system-worker/src/aggregateProjection/resolveAggregateProjectionView.ts#L41-L58), [private completion ownership](../../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts#L79-L89).

## Approved three-column row

```ts
{
  agentName: string;
  agentVersion: number;
  acknowledgedAggregateIndex: number;
}
```

The agent name/version pair is unique together; all three fields are non-null. The full recipient key is `{ ...this.key, agentName, agentVersion }`. An agent projection has no actor path or claims partition. Its authored selections and `sessionName` come from the exact agent definition; individual `nodeId` values identify sessions, not separate materialized agent views.

An absent row means **unenrolled**. Zero means **enrolled without an acknowledged command position**. Reaching the source tip keeps membership for future commands. No expiry, last-seen, failure, availability, connection or producer field is justified. There is no demonstrated need for an additional progress index.

Plan 204's shared queue supports named identity columns, complete-tuple conflicts, ordering, acknowledgement and exclusion. Plan 206 changes the agent table and its binding through that existing API. The binding extracts `{ agentName, agentVersion }` and reconstructs the complete key with `{ ...this.key, ...identity }`; full owner-qualified RPC keys and the transport cursor `currentIndex` remain. The SQL field names AggregateVersionChain's durable acknowledgement as `acknowledgedAggregateIndex`.

- [Authored agent release fields](../../../packages/core/src/agent/types.ts#L30-L41), [agent view bindings](../../../packages/system-worker/src/aggregateProjection/resolveAggregateProjectionView.ts#L41-L58), [structured identity storage and bounded selection](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts#L87-L205).

### Why a finite authored registry does not replace enrollment

The registry can enumerate available definitions. It cannot establish which AggregateAgentVersionRepo projections have activated, completed catch-up and enrolled for this Aggregate instance, or their acknowledged positions. Opening an agent session acquires one exact projection, and its activation enrolls even if that agent has never originated a command. Deriving membership from command Origin therefore misses valid subscribers. Enumerating all authored agents as recipients would introduce eager projection creation/materialization and would still need per-agent progress. Neither behavior is required by the governing late-activation architecture.

- [Exact session projection acquisition](../../../packages/system-worker/src/SystemApi/openAgentSession/openAgentSession.ts#L32-L52), [activation-owned subscription](../../../packages/system-worker/src/AggregateAgentVersionRepo/AggregateAgentVersionRepo.ts#L59-L65), [catch-up then actual committed-cursor enrollment](../../../packages/system-worker/src/makeFanoutSubscriber/subscribe.ts#L35-L55), [governing late enrollment](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md#decision).

## Enrollment, acknowledgement, recovery and deletion

1. AggregateAgentVersionRepo activation resolves its exact authored view, catches up to a fixed source prefix, rereads its actual committed materialization head and then enrolls. Failed catch-up does not create the normal enrollment row. Permanent `commands` covers the catch-up/enrollment interval.
2. AggregateVersionChain checks every bound source-owner field and cursor bounds, then synchronously upserts membership/progress with `max`. Enrollment runs outside the drain semaphore; its producer lease spans source-tip checking and upsert. A drain waiting for cold AggregateAgentVersionRepo activation cannot deadlock that Repo's subscription, and an overlapping empty drain cannot release a newer enrollment's wake.
3. A drain fixes one source tip. Bounded SQL selects lagging identities, excluding complete in-flight/failed identities before `LIMIT`. Every Aggregate position matters for contiguous resource replay, `dispositionChainHash` and selected/private output, including refusals and empty selected deltas. Command Origin alone does not decide delivery membership.
4. AggregateAgentVersionRepo commits the page's resource changes, materialization progress and complete pending selected publication together in one synchronous transaction. Only after its successful receipt does AggregateVersionChain advance source acknowledgement to the last delivered row, rather than the envelope's advertised tip.
5. That receipt does not prove publication to AggregateAgentVersionChain. `projectedCommandOutbox` has its own durable acknowledgement/deletion. A lost source receipt can leave `acknowledgedAggregateIndex` behind AggregateAgentVersionRepo's materialization head; redelivery skips already committed positions without reapplying resources. This makes the two progress facts distinct rather than redundant copies.
6. Errors and defects settle independently. A failed agent retains its row/cursor and is excluded only for that drain; healthy projections continue. Both source queues hold producer recovery before command append. Unsuccessful drains retain or renew durable alarms, and cold activation reconstructs delivery from retained rows. No stored suspension or manual resume is needed.
7. There is **no deletion, unsubscribe, expiry or retirement path**. Capability disposal, browser disconnection, inactivity and empty selection do not end enrollment. Deleting a row stops future push delivery until that exact AggregateAgentVersionRepo activates and reenrolls. Acknowledgement never deletes `commands`.

- [Source-bound projection capability](../../../packages/system-worker/src/aggregateProjection/evaluatedCommandsFanoutSubscriber/evaluatedCommandsFanoutSubscriber.ts#L40-L97), [fixed catch-up](../../../packages/system-worker/src/makeFanoutSubscriber/runFanoutCatchup.ts#L38-L90), [owner and availability checks](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts#L107-L143).
- [Receipt before acknowledgement](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L270-L301), [whole-page projection transaction](../../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommands.ts#L19-L36), [contiguous and duplicate application](../../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts#L94-L157), [publication/head commit](../../../packages/system-worker/src/aggregateProjection/commitProjectionTx/commitProjectionTx.ts#L82-L99), [separate publication acknowledgement](../../../packages/system-worker/src/aggregateProjection/makeProjectedCommandOutbox.ts#L65-L79).
- [Independent deliveries](../../../packages/system-worker/src/makeFanoutQueue/runFanoutDeliveries.ts#L20-L62), [source producer leases](../../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts#L209-L217), [producer/drain recovery](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L310-L392), [durable alarms](../../../packages/system-worker/src/makeRecoveryRegistry/makeRecoveryRegistry.ts#L28-L79).

## Separate source-validation and availability boundary

Normal `SystemApi.openAgentSession` and AggregateAgentVersionRepo activation resolve the exact configured agent and its Aggregate release before enrollment. AggregateVersionChain's agent queue itself validates key shape, owner and cursor but supplies neither `availableSubscriberIdentities` nor another authored-agent membership predicate. Direct internal enrollment can therefore persist a same-owner unavailable agent name/version. Previously valid agent code can also disappear from the configured bundle. Accepted definitions are immutable; an unavailable or mismatched candidate cannot satisfy projection activation.

When that subscription is lagging, acquisition/application fails, preserves membership and acknowledgement, and renews recovery while healthy subscriptions advance. Default alarm renewal is one second, not a guaranteed retry latency. This is a source-boundary validation and availability/retirement policy gap; no ordinary-path data-loss defect or public-user exploit was established. Temporary unavailability does not authorize deleting the row. Additional authored-membership validation or retirement policy needs its own explicit decision; it is separate from the approved three-column cutover.

- [Normal authored agent validation](../../../packages/system-worker/src/SystemApi/openAgentSession/resolveRegisteredAgentSelection.ts#L18-L55), [projection activation configuration](../../../packages/system-worker/src/AggregateAgentVersionRepo/aggregateAgentVersionRepoMigratableDORepoConfig.ts#L19-L25), [agent view validation](../../../packages/system-worker/src/aggregateProjection/resolveAggregateProjectionView.ts#L41-L58), [agent source binding](../../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts#L118-L154).
- [Accepted-definition equality](../../../packages/system-worker/src/SystemRepo/acceptedDefinitions/requireAcceptedDefinitionEntries.ts#L21-L36) rejects changed accepted identities rather than permitting rebinding.

## Reconciled finding and verification limits

Independent column-design and lifecycle reviewers agree: retain durable membership and source acknowledgement, expose only the variable agent pair, and name acknowledgement precisely. Current ordinary enrollment/receipt/retry behavior is sound. Existing consumers establish usage; owner derivation, lazy participation and separate durable receipt facts establish necessity. The authored-registry alternative does not eliminate those facts.

**Plan 206 verification:** All nine scoped system-worker tasks passed, including
27 Workerd tests across six files; existing acceptance checks passed all 13 groups.
Existing owner verification proves exact physical columns, composite uniqueness,
independent acknowledgement for two agent versions, monotonic reenrollment and
recovery without reapplying committed projection state. Independent source review
found no actionable defect. Current documentation links/ranges, source metadata,
formatting and whitespace checks passed. Results are recorded in
[Plan 206](../../archive/plans/206-plan-aggregate-agent-fanout-subscriber-identity.md).
This changed fixed schema requires empty affected AggregateVersionChain storage,
with no compatibility path or automatic reset. Additional publication
`dispositionChainHash` validation remains deferred.

The original review changed only this finding and Plan 151. It checked source,
document links/ranges, formatting and whitespace without rerunning runtime,
type, lint, test or build checks. Prior Plan 203/204 verification remains historical
evidence for that review, independently of the Plan 206 verification above.

**Next table:** AggregateActorVersionRepo.materializationHead. This shared schema's different owner context still needs its own review.
