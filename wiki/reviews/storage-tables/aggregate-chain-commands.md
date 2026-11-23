# AggregateChain.commands

**Reviewed:** 2026-10-15, Plan 195 implementation and approved outcome-retention simplification.

**Status:** Current finding updated for eleven immutable input/position fields plus nullable `commandOutcome`. Pending-request and VersionChain tables still need their own lifecycle/column reviews.

**Review queue:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Governing architecture:** [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md), with the remaining rules of ADRs 013/014.

## Current finding — 2026-10-15

### Verdict

**Retain the eleven immutable input/position columns and nullable `commandOutcome`
on `commands`. Remove AggregateChain.originalExecutions and its stored hash.**
A nonnull `commandOutcome` proves AggregateChain retained the original finalization
receipt. AggregateChain needs that original outcome for replay availability and direct
results, not another complete execution history. Complete original output remains in
AggregateVersionRepo's pending AVC publication and then immutable AVC commands.
No dispatch flag, result cache or completion fingerprint is introduced.

### Physical scope and lifecycle

One AggregateChain database is bound to `{ systemId, aggregateId, aggregateName }`
across releases. One row is one admitted command. `aggregateIndex` is the primary
key; `id` is independently unique; `commands_node` uniquely indexes `(nodeId, pushIndex)`.
Eleven fields freeze at admission; `commandOutcome` starts null and is set once by
original receipt acknowledgement. Admission retries compare only immutable input.
Rows survive acknowledgement and replay. Deleting them would lose exact admission
retry identity, input authority, original results and late release replay. The
migration ledger and complete pending requests have separate responsibilities.

### Every column

| Column             | Ownership, lifecycle and null rule                                                                                                        | Removal consequence and finding                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | Stable immutable command ID. Admission retries and original replies use it.                                                               | Retain: position cannot identify a pre-admission retry.                                                                                     |
| `commandName`      | Exact incoming contract name within the aggregate family. Nonnull.                                                                        | Retain: owner/release does not identify one contract.                                                                                       |
| `payload`          | Exact immutable encoded string, decoded by execution. Nonnull.                                                                            | Retain: equivalent JSON serialization is not exact retry identity.                                                                          |
| `externalOutcome`  | First external observation as command input. Null for ordinary input; successful JSON null remains explicit.                              | Retain: distinct from this command's `commandOutcome`; cannot reconstruct a remote observation.                                             |
| `contractVersion`  | Incoming contract version, independent of executing release. Nonnull.                                                                     | Retain: required for ordinary lineage/exact external decoding.                                                                              |
| `aggregateVersion` | Pinned original execution release; preserved on external commands. Nonnull.                                                               | Retain: routes original finalization; no latest-release selector.                                                                           |
| `nodeId`           | Producer identity. Null exactly when sessionName/pushIndex are absent.                                                                    | Retain: Origin can have multiple producers.                                                                                                 |
| `origin`           | Exact Actor/Agent/System authority and actor claims. Nonnull, frozen.                                                                     | Retain: bound owner identity is not invocation authority.                                                                                   |
| `sessionName`      | Authored producer session definition. Null with absent producer tuple.                                                                    | Retain: neither nodeId nor Origin identifies it.                                                                                            |
| `pushIndex`        | Consecutive position for this producer. Null with absent producer tuple.                                                                  | Retain: interleaved commands prevent derivation from aggregateIndex.                                                                        |
| `aggregateIndex`   | Positive contiguous admission position allocated transactionally. Primary key.                                                            | Retain: stable identity does not encode ordering.                                                                                           |
| `commandOutcome`   | Original Success/Failure with exact result/failure and recordedAt. Null until original receipt retention; set once with pending requests. | Retain on this row: controls pending selection and finalized replay, supplies original results and rejects contradictory repeated outcomes. |

### Transactions and recovery

Ordinary admission validates and inserts a page synchronously; a later failure rolls
back all new rows. Exact retries recover before current declarations, independently
of a later retained outcome. AggregateChain executes the oldest admitted command with
null `commandOutcome` through its pinned AggregateVersionRepo. First receipt validates
the complete reply, identity/provenance, predecessor and operation associations, then
sets `commandOutcome` and inserts complete externalOperationOutbox rows atomically.
A failed pending insertion also rolls back the outcome update.

Repeated receipts compare the exact retained `commandOutcome`, including `recordedAt`;
a difference rejects with the existing mismatch error. An equal outcome returns before
pending insertion even after requests have drained. AggregateChain deliberately stops
comparing repeated operation bodies, execution-start time and dispositionChainHash.
AVC continues complete packet equality. A dispositionChainHash cannot replace exact
outcome comparison because its preimage excludes result/failure details and timestamps.

AggregateChain alone runs Aggregate external requests. Its first observation transaction
re-reads frozen pending authority, appends the resulting admitted command and deletes
the request atomically. A failed append/deletion commits neither fact; missing requests
make late callbacks no-ops. After pending deletion, immutable AVC history retains original
external descriptions; admitted commands do not copy parent lineage.

Replay, point reads and direct execution read `commands.commandOutcome` directly.
Replay ends before the first null outcome, preserving the finalized prefix and pinned
original order. Complete original reply recovery still uses AVR's pending
aggregateVersionChainOutbox, then AVC history. AggregateChain stores no execution packet
or dispositionChainHash. AVR/projection materializationHead rows and selected session histories
retain hashes for their own progress/verification responsibilities. Future comparison
at the same aggregate identity and aggregateIndex establishes only ordered command-ID
and Success/Failure prefix agreement, not equal results, operations or resource state.

- [Schema](../../../packages/system-worker/src/AggregateChain/aggregateChainDbConfig.ts) — eleven immutable input fields plus the retained original outcome and separate complete pending requests.
- [Original receipt retention](../../../packages/system-worker/src/AggregateChain/recordOriginalCommandOutcomeTx.ts) — exact-outcome retries and atomic outcome/pending insertion.
- [Observation/admission](../../../packages/system-worker/src/AggregateChain/recordExternalOutcomeAndAdmitCommandTx.ts) — same-owner atomic transfer.
- [Replay](../../../packages/system-worker/src/AggregateChain/readReplayPage.ts) — finalized occurrences read directly from commands without deleting input.

### Verification and next review

Plan 195 records scoped implementation verification. This finding updates only
AggregateChain.commands; it does not count pending external operations or AVR/AVC
publication/history as reviewed tables. Continue Plan 151 one table per review turn.
This fixed-schema change requires empty AggregateChain storage; no reset occurred.
ServiceChain keeps originalExecutions and complete duplicate-packet comparison.

## Historical review — 2026-10-14

Everything below records the earlier schema and follow-up decisions. Current conclusions are in the dated finding above.

**Reviewed:** 2026-10-14

**Status:** Historical pre-Plan-152 review. Plans 152/189/190/193 supersede its physical schema and acknowledgement analysis; the current finding above governs. The input/Origin reasoning remains historical evidence.

**Review queue:** [Plan 151](../../plans/151-plan-storage-table-review.md).

**Recalibration (2026-10-15):** Historical source snapshot before Plans 152/189/190. Follow [Plan 151](../../plans/151-plan-storage-table-review.md) for the current review order; do not treat earlier representation proposals as current decisions.

**Implementation:** [Plan 152](../../archive/plans/152-plan-aggregate-chain-command-storage.md) is implemented, verified and archived. Its flat `commandOutcome`/`externalOutcome` representations, failure continuations and Chain-owned original-result recovery supersede the representation alternatives recorded below. This review preserves its pre-change source evidence; the parent table review continues independently.

### Verdict

The table has a coherent responsibility: retain admitted aggregate inputs in order and remember which originals have been acknowledged so replay can advance. Its current 16-column representation mixes per-command facts, repeated owner context and delivery bookkeeping. Finding uses for all 16 columns does not justify keeping all 16 in this form.

The strongest findings are duplicated `aggregateId`/`aggregateName`, ambiguous `response` presence, and a full original outcome copied into `finalization` when the Chain mainly needs completion evidence. The maintainer has chosen to remove `systemName` entirely from this metadata. The producer/session tuple and delivery diagnostic have concrete purposes that should be documented rather than dismissed as redundant.

This audit identifies representational complexity; it does not establish a runtime defect. Independent lifecycle and design reviews agreed on these findings. [ADR 003](../../adrs/003-immutable-node-command-history-and-submission-order.md), [ADR 005](../../adrs/005-ordered-original-execution-and-finalized-replay.md), [ADR 008](../../adrs/008-ordinary-and-recorded-continuation-authority.md) and [ADR 012](../../adrs/012-opaque-external-work-and-originating-chain-continuations.md) describe current source. The maintainer follow-up below overrides the earlier frozen System-name requirement; reconcile that wording with eventual implementation. Other proposed representations remain open.

### Row meaning and owner

One row is one immutable admitted command occurrence for the aggregate identified by the containing database. The database key is `systemId / aggregateId / aggregateName`; it spans aggregate releases. `aggregateIndex` orders all admissions, while `id` identifies an exact retry. [Owner declaration](../../../packages/system-worker/src/AggregateChain/aggregateChainName.ts#L7-L10), [table definition](../../../packages/system-worker/src/AggregateChain/aggregateChainDbConfig.ts#L12-L47).

Admission freezes 14 fields. The Chain subsequently changes only `finalization` and `lastDeliveryFailure`. Rows remain in history after acknowledgement. Ordinary submissions and recorded continuations share the table, but pass different admission authority checks. [Append](../../../packages/system-worker/src/AggregateChain/admitAggregateCommands/appendAggregateCommand.ts#L17-L32), [ordinary transaction](../../../packages/system-worker/src/AggregateChain/admitAggregateCommands/admitAggregateCommandsTx.ts#L30-L54), [recorded transaction](../../../packages/system-worker/src/AggregateChain/admitExternalCommands/admitRecordedAggregateCommandsTx.ts).

### Every column

“Retain” below means a demonstrated domain fact, not blanket approval of every encoding or duplicated copy. The detailed findings distinguish current requirements from proposed simplifications.

| Column                | Plain-language purpose and lifecycle                                                                                                                                                                               | Disposition                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `id`                  | Stable command identity. Unique; immutable. Admission uses it to recover an exact retained retry instead of allocating another occurrence.                                                                         | Retain. `id` is clear in a commands table; avoid an isolated cosmetic rename.           |
| `commandName`         | Which declared command to evaluate. Immutable; used with the contract and original release versions to resolve source meaning and the executing implementation.                                                    | Retain.                                                                                 |
| `payload`             | Exact encoded input string. Immutable; retry compares the string exactly, and execution decodes it according to the retained contract. Re-serializing equivalent JSON can change retry identity.                   | Retain; document encoded input, not a decoded JSON object.                              |
| `response`            | Frozen external result used as input to a continuation. It is not this command's execution result. Ordinary absence and recorded JSON null both decode as null.                                                    | Clarify name and simplify presence representation: finding 2.                           |
| `contractVersion`     | Version of the submitted input contract. Ordinary input may use supported historical lineage; a recorded continuation preserves its exact external declaration version. Immutable.                                 | Retain; distinct from aggregate release.                                                |
| `aggregateId`         | Aggregate instance ID, equal to the containing Chain's key. Immutable; repeated in the transported command for owner and claims checks.                                                                            | Remove from per-row storage in a scoped redesign: finding 1.                            |
| `aggregateName`       | Aggregate family name, equal to the containing Chain's key. Immutable; repeated in the transported command for registry lookup and owner checks.                                                                   | Remove from per-row storage in a scoped redesign: finding 1.                            |
| `systemName`          | Frozen authored System name. Immutable; new admission checks it and downstream external work retains it. It is not the database's `systemId`.                                                                      | Remove; maintainer decision in finding 1.                                               |
| `aggregateVersion`    | Original/source aggregate release. Immutable; original delivery goes to that VersionRepo. Other versions replay with their own programs while retaining this source lineage.                                       | Retain; it is not the replaying version.                                                |
| `nodeId`              | Durable submission producer identity. Immutable; identifies the producer sequence and private completion owner across connections. Null for commands without a Node producer.                                      | Retain; document alongside `pushIndex` and `sessionName`: finding 4.                    |
| `origin`              | Frozen authority: actor definition/version and claims, agent definition/version, or system authority. Immutable; used for admission, execution and completion privacy.                                             | Retain; explain structured fields: finding 4.                                           |
| `sessionName`         | Declared session definition associated with the Node producer. Immutable; fixed for that producer and used to match private completion. Null with absent producer tuple.                                           | Retain its meaning; document that this is a definition name, not a session instance ID. |
| `pushIndex`           | Consecutive submission position within `nodeId`. Immutable; enforces producer continuity and supports recovery of private outcomes. Null with absent producer tuple.                                               | Retain; document the durable submission meaning of “push.”                              |
| `aggregateIndex`      | Admission position in the whole aggregate's history. Immutable positive safe integer; primary key. Allocated transactionally, then used for original execution, replay and acknowledgement.                        | Retain. Distinct from producer submission order.                                        |
| `finalization`        | Original command outcome acknowledged by the Chain: success with result or public refusal. Starts null; first committed outcome is immutable and conflicting acknowledgement is rejected. Non-null permits replay. | Retain full original outcome; maintainer decision in finding 3.                         |
| `lastDeliveryFailure` | Latest original-delivery/acknowledgement diagnostic while pending. Starts null, may be overwritten, and is cleared on acknowledgement. It does not make a command terminal or determine retry eligibility.         | Retain the established diagnostic purpose; clarify delivery phase: finding 5.           |

Admission comparisons explicitly cover all immutable input fields in [readRetainedCommand](../../../packages/system-worker/src/AggregateChain/admitAggregateCommands/readRetainedCommand.ts#L19-L42). Declaration and payload meaning are resolved by [validateNewAggregateCommand](../../../packages/system-worker/src/AggregateChain/admitAggregateCommands/validateNewAggregateCommand.ts#L25-L66) and [resolveAggregateExecution](../../../packages/system-worker/src/AggregateVersionRepo/utils/resolveAggregateExecution.ts). Ordering, completion and diagnostics are wired in [AggregateChain](../../../packages/system-worker/src/AggregateChain/AggregateChain.ts#L109-L181).

### Findings

#### 1. A complete transport envelope is not a minimal stored row

`aggregateId` and `aggregateName` are already fixed by the database identity. Ordinary admission checks them against the bound key before retention; downstream execution checks them again. Neither column partitions this table or supplies an independent per-command fact. Their current usage proves that transported commands need owner context, not that every row must persist it. [Admission scope](../../../packages/system-worker/src/AggregateChain/admitAggregateCommands/validateAggregateSubmission.ts#L14-L27), [execution scope](../../../packages/system-worker/src/AggregateVersionRepo/utils/readAggregateCommandTx.ts#L32-L42).

The clearer model stores command-specific facts and reconstructs those two owner fields from the bound Chain at delivery/replay boundaries. A later implementation must preserve complete owner-qualified envelopes and reject wrong-owner input; simply deleting the downstream checks would not establish equivalence. It must also decouple the transported occurrence from the current `$inferSelect` row type instead of keeping renamed duplicate fields.

Current source also freezes `systemName`, following [Plan 150](../../archive/plans/150-plan-opaque-external-work.md). The existing work table and continuation reconstruction consume that value. [Work preparation](../../../packages/system-worker/src/AggregateVersionRepo/utils/prepareAggregateOutput.ts), [continuation reconstruction](../../../packages/system-worker/src/externalOperations/readPreparedExternalCommand.ts).

**Maintainer decision, 2026-10-14:** remove `systemName` from command/external-work metadata. The bound repository and capability already establish System ownership. The old frozen-name rule was not an independently justified command-lifecycle requirement. Do not relocate it into a singleton, renamed field or replacement envelope. Reconcile the superseded provenance wording during implementation.

#### 2. `response` hides both direction and presence

There are two different values in a continuation's lifecycle: the external request's recorded result becomes command input; the continuation program then produces its own execution outcome. `response` stores the first, `finalization` the second. They are not duplicate outputs.

Ordinary ingress requires response absence. Retention changes absence to null. A recorded external response can legitimately be JSON null, so its retained value is indistinguishable from ordinary absence. Execution consults the source declaration's `external` capability to decide which case it is. [Ordinary rule](../../../packages/system-worker/src/AggregateChain/admitAggregateCommands/validateAggregateSubmission.ts#L29-L34), [normalization](../../../packages/system-worker/src/AggregateChain/admitAggregateCommands/appendAggregateCommand.ts#L21-L29), [required recorded response](../../../packages/core/src/contracts/ExternalAggregateCommandSchema.ts#L4-L11), [declaration-dependent distinction](../../../packages/system-worker/src/AggregateVersionRepo/utils/resolveAggregateExecution.ts#L23-L35).

The current source supports JSON-null continuation input through that declaration check; this audit found no failure of that behavior. The representation still needs an explanation outside the row and makes absence easy to misinterpret.

**Maintainer decision, 2026-10-14:** rename the input to `externalResponse`. Its content is encoded by the exact external contract's response codec, as the current [response runner](../../../packages/system-worker/src/externalOperations/makeExternalOperationQueue.ts) already does. Execution decodes with that same declaration in [decodeExternalCommandInput](../../../packages/core/src/contracts/decodeExternalCommandInput.ts). The open representation issue is only absence versus a recorded JSON null.

**Recommended representation, not yet selected:** a nullable text column containing the serialized contract-encoded JSON. SQL NULL means absent; the non-null text `null` means an external response whose encoded value is JSON null. A retained encoded JSON string is parsed and decoded with the exact contract before evaluation. This preserves presence without a wrapper or additional status column; a heterogeneous commands table cannot use one contract-specific codec for every row.

#### 3. The Chain needs acknowledgement evidence; it also stores a full outcome copy

The originating VersionRepo commits the canonical original outcome with its complete materialization in `executedCommands`. Direct command execution returns the VersionRepo's retained result. The Chain uses its own `finalization` primarily as a null/non-null gate for pending original delivery and the contiguous replay prefix. Replay checks non-null, then discards that incoming outcome and evaluates its own version's program. [Canonical retention](../../../packages/system-worker/src/AggregateVersionRepo/utils/retainEvaluatedCommandTx.ts#L18-L32), [direct result source](../../../packages/system-worker/src/AggregateChain/executeAggregateCommand/executeAggregateCommand.ts#L25-L34), [replay gate](../../../packages/system-worker/src/AggregateChain/readReplayPage.ts#L12-L27), [replay input reconstruction](../../../packages/system-worker/src/AggregateVersionRepo/utils/readAggregateCommandTx.ts).

The full Chain outcome has one additional semantic use: a repeated acknowledgement with a different success result or failure is rejected. Generic table inspection can also display the value. Historical `acknowledgeOriginalDispatch.ts` supplied acknowledgement equality before the current protocol..

This is an existing consistency check, but it is not proof that the Chain must retain a second complete result payload forever. A smaller representation must explicitly assess the two current behaviors: remembering original commitment and rejecting contradictory acknowledgements. A boolean or cursor alone loses the second property. First-principles exploration must also ask whether the Chain needs to receive outcome values at all when the VersionRepo already owns the immutable outcome.

**Important constraint:** the existing `dispositionHash` cannot replace complete outcome comparison. Its success preimage intentionally omits `result`; two different successful result values can have the same disposition hash when the other inputs match. [encodeDispositionTuple](../../../packages/core/src/contracts/dispositionChainHash.ts#L15-L23). A new complete-outcome fingerprint would introduce encoding and computation responsibilities of its own; do not add it without comparing that cost to the current copy. Preserve synchronous acknowledgement atomicity, including any computation boundary.

**Maintainer decision, 2026-10-14:** keep `finalization` with the command's complete original result. [ADR 005](../../adrs/005-ordered-original-execution-and-finalized-replay.md) already requires the direct Chain outcome. The cursor and digest alternatives below were considered and are not the chosen design. The full copy should serve the Chain's original-result retrieval responsibility.

**Rubber-duck alternatives, 2026-10-14:**

- Retain full `finalization` and let the Chain serve the original result locally. The copy earns a concrete result-retrieval responsibility, including after its originating VersionRepo becomes unavailable. Keeping the copy while continuing to fetch every result from the VersionRepo does not purchase that benefit.
- Retain one Chain-wide `finalizedThroughIndex`. Original execution is ordered, so acknowledgement is a contiguous prefix. The VersionRepo returns committed occurrence identity; one synchronous Chain transaction advances the cursor and clears the diagnostic. Lost replies leave the cursor unchanged and redelivery recovers the committed confirmation. Outcomes remain solely in the VersionRepo; the Chain interface no longer compares business outputs.
- Retain a complete original-outcome digest per row. This preserves contradictory-receipt detection while dropping result payloads, at the cost of canonical encoding, hashing and opaque diagnostics. The existing disposition hash is insufficient.

The selected design retains the full outcome. Its domain meaning remains success/result or encoded public error, with null only for pending.

**Timestamp discussion, 2026-10-14:** a finalization timestamp would describe when the original VersionRepo records its terminal outcome. Sample it after evaluation or retained refusal, alongside final-result retention in the same transaction; it is a wall-clock recording time, not an exact SQLite commit instant. The Chain copies the retained value unchanged, and retries recover it. Replay does not replace the Chain's original timestamp with replay time. Ordering continues to use command indices.

Current command-result rows have no completion timestamp. `occurrence.startedAt` records execution start, and operation `committedAt` currently copies that start time; those facts cannot be relabeled as completion. The proposed object can separate the success/error outcome from recording metadata, for example `{ outcome, recordedAt }`, while pending finalization remains null. Exact shape and names are not selected yet.

#### 4. Producer identity, authority and session definition are separate facts

The three nullable columns `nodeId`, `sessionName` and `pushIndex` form one all-null or fully populated tuple in the command schema. SQL declarations alone allow combinations that command decoding rejects. Each Node's next input position must be consecutive, and its session definition, source release and full origin cannot change mid-sequence. [Tuple schema](../../../packages/core/src/contracts/CommandSchema.ts#L84-L95), [producer continuity](../../../packages/system-worker/src/AggregateChain/admitAggregateCommands/validateAggregateNodeContinuation.ts#L18-L55).

`origin` contains actor `{ kind, actorName, actorVersion, claims }`, agent `{ kind, agentName, agentVersion }`, or system `{ kind }`. Actor claims are retained invocation identity/authority, not a live authenticated user lookup. Definition names and versions must not be reconstructed from a newer release. [Origin schema](../../../packages/core/src/contracts/AggregateCommandOriginSchema.ts).

`nodeId` says which durable producer submitted the input. `origin` says under whose authority it runs. `sessionName` says which declared session definition participates. `pushIndex` counts that producer's originating submissions; `aggregateIndex` orders admissions from every producer and external continuation. A recorded continuation retains authority but has no Node tuple. [Recorded child](../../../packages/system-worker/src/externalOperations/readPreparedExternalCommand.ts).

These distinctions buy an observable privacy/recovery requirement: reconnect can recover its own private completion independently of public aggregate replay. Selected storage carries completion identity; resume matches Node, session definition and full origin and tracks private submission and aggregate cursors separately. [Completion ownership](../../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts#L78-L88), [private recovery match](../../../packages/system-worker/src/aggregateSessionChain/getBrowserCommands/getBrowserCommands.ts#L162-L167), [independent resume cursors](../../../packages/system-worker/src/aggregateSessionChain/onMessage/replayAggregateSocketCommands.ts#L60-L79).

**Recommendation:** document this tuple and its terminology. There is no demonstrated reason to collapse it into an opaque routing blob or equate session definition with session instance. Normalizing repeated producer metadata elsewhere would be a separate ownership trade-off, not a free column deletion.

**Maintainer decision, 2026-10-14:** every Origin variant carries a required literal `kind`: `'actor'`, `'agent'`, or `'system'`. Session-origin unions contain actor and agent variants; command-origin unions also contain the explicit System variant. Prefer actor terminology over browser terminology because actor sessions also run on native hosts. System authority is represented by `{ kind: 'system' }`.

System Origin currently has no credential identity. Production authenticates one deployment secret and retains only System identity in the capability; internal authorization evaluation can also use System authority without a private token. A future credential-attribution requirement could add a non-secret credential ID supplied by authentication, not the submitted command. Add no placeholder credential field now. [Secret policy](../../../packages/system-worker/src/GatewayApi/getSystemApi/checkSecretApiKey/checkSecretApiKey.ts), [System capability](../../../packages/system-worker/src/SystemApi/Initialized.ts), [internal authorization](../../../packages/system-worker/src/AggregateVersionRepo/authorizeAggregateSession/authorizeAggregateSession.ts).

#### 5. Delivery failure is not business failure

`lastDeliveryFailure` can mean that execution failed to start, or that the VersionRepo committed but the reply or Chain acknowledgement failed. In both cases the Chain remains pending and retries the same input. A business refusal belongs in `finalization`, completes the occurrence and allows later originals to proceed. [Pending delivery diagnostic](../../../packages/system-worker/src/AggregateChain/AggregateChain.ts#L121-L159), historical `acknowledgeOriginalDispatch.ts` atomic acknowledgement.

No named business reader uses the diagnostic to authorize retries or decide completion. That does not make it useless: [the local retry pattern](../../patterns/system-worker/effect-retry-no-persisted-counters.ts) explicitly establishes retained operator-visible diagnostics without persisted retry counters. Its purpose is bounded and understood.

**Recommendation:** document “latest original-delivery or acknowledgement failure,” including the committed-but-unacknowledged case. Consider `lastOriginalDeliveryFailure` only if the broader queue vocabulary requires that distinction; this review does not require a cosmetic rename. Do not add retry attempts, next-retry timestamps or a separate terminal-failure flag.

### Transaction and recovery requirements

1. Admission decodes the complete page, then one synchronous transaction recovers exact duplicates or validates/allocates new occurrences. A later conflict rolls back the whole page; retained retries recover before consulting current declarations. Recorded ingress separately proves the complete child before its admission transaction.
2. The original outbox sends the oldest pending occurrence to its retained aggregate release. Infrastructure failure keeps it pending and blocks later originals. External work runs after original commit and does not hold up later originals.
3. Acknowledgement verifies complete input identity, position and immutable outcome, then synchronously stores finalization and clears delivery diagnostics. A lost receipt must recover the VersionRepo's already-committed result without evaluating the original again.
4. Replay exposes only the contiguous acknowledged prefix. Each release evaluates its own guards/program; the original outcome is availability evidence, not a result to impose on replay. Alarm recovery and replay wake-up cover interruption after acknowledgement.

These describe the current contracts. A simplification must explicitly identify the contracts it changes and why; completion-interface alternatives may remove Chain outcome comparison while keeping immutable outcomes in the VersionRepo. The current [AggregateChain README](https://github.com/morgs32/zerospin/blob/79c1824b1a0353f770211851c0bfe1cc54d0ba46/packages/system-worker/src/AggregateChain/README.md) and ADRs above describe their owning procedures.

### Evidence and verification limits

Reviewed current working-tree source, including the uncommitted Plan 150 implementation. Base commit: `7c98a5fcd7099dd965395a33b695d6b15a62a77d`. Table definition SHA-256: `257c933bdb759896e5d0df454c35549fc6a15d7bcc891558465e63598bcf366a`.

All 16 columns and their lifecycle consumers were examined, with separate lifecycle and critical design reviewers and primary-agent reconciliation. This was source analysis; no runtime tests were run and no cleanup equivalence is claimed. Only the review documents changed. Recheck cited source before implementing a finding because line numbers and the working tree can change.
