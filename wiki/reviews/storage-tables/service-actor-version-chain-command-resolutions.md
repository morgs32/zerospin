# ServiceActorVersionChain.commandResolutions

**Reviewed:** 2026-10-16 against source then current, with independent column-design and lifecycle reviewers. Exactly this private-history table was reviewed; public history, pending publication, snapshots and sockets were dependencies. That source review ran no checks. The Plan 217 implementation and completed 2026-10-22 verification are recorded separately below.

**Verdict: retain all six columns, current constraints and permanent immutable private history. The direct `getResolvedThrough` cleanup is implemented and verified under completed Plan 217.** Keep `serviceIndex`, `nodeId`, `pushIndex`, `sessionName`, full original `claims` and nullable `failure`. Snapshot/private-progress probes now read the scalar directly; actual payload replay retains its joined public-command reader.

**Decision status:** schema retention is supported. The source review made the bounded reader recommendation below; the maintainer subsequently approved it in [Plan 217](../../archive/plans/217-plan-service-direct-resolution-prefix-read.md). Implementation and scoped verification are complete. The original review authorized no production change by itself. [Plan 151](../../plans/151-plan-storage-table-review.md) tracks the next table. [ADR 015](../../adrs/015-service-delivery-history-and-projection-ownership.md) and applicable [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md) rules govern ownership. Plans 196/211/212/213 retain their separate active/unverified status. [Plan 214](../../archive/plans/214-plan-service-ordered-operations-and-finalized-at.md), [Plan 215](../../archive/plans/215-plan-service-commands-backed-actor-fanout.md) and [Plan 216](../../archive/plans/216-plan-service-actor-subscriber-identity.md) completed their scoped verification on 2026-10-22; Plan 217's reader guarantees have their own evidence below.

## Physical owner and represented fact

One ServiceActorVersionChain fixes `{ systemId, serviceName, serviceVersion, actorName, actorVersion, actorPath }`. It resolves the exact Service release and canonical actor view before using its fixed history schema. ServiceActorVersionRepo separately owns resources, its materialization head and complete pending selected publication.

One child row records the exact private producer/recipient and successful-or-refused resolution owned by the public command at `serviceIndex`. This is **immutable private history**, appended with its public parent. It has no independent delivery, acknowledgement or retention lifecycle and stores neither successful result values nor `outcome.finalizedAt`.

The producer supplies a resolution only for Actor Origin matching the bound actor name/version and canonical partition identity, with a complete admitted Node/session/push tuple. It copies the complete original encoded claims, including fields outside actorPath. Fixed Actor kind/name/version derive from the bound Chain; no repeated Origin, Service identity or actor path columns are needed.

- [Physical identity](../../../packages/system-worker/src/ServiceActorVersionChain/serviceActorVersionChainName.ts#L11-L18), [validated release/view configuration](../../../packages/system-worker/src/ServiceActorVersionChain/serviceActorVersionChainMigratableDORepoConfig.ts#L14-L24), [relation declaration](../../../packages/system-worker/src/ServiceActorVersionChain/serviceActorVersionChainDbConfig.ts#L14-L44), [producer ownership](../../../packages/system-worker/src/serviceProjection/applyEvaluatedCommandsTx.ts#L38-L55), [full private construction](../../../packages/system-worker/src/serviceProjection/applyEvaluatedCommandsTx.ts#L56-L74), [bound Origin reconstruction](https://github.com/morgs32/zerospin/blob/15e505c3322dad08504946923e0c15f4fb1768e9/packages/system-worker/src/ServiceActorVersionChain/readServiceBrowserCommandPage.ts#L40-L65).

## Every column, constraint and consumer

The first five columns are required/non-null; only `failure` is nullable. There are no SQL defaults, generated IDs/timestamps or additional lifecycle fields. `serviceIndex` is the primary/reference key to `exposedCommands.serviceIndex`, expressing one optional private child per parent. Its descriptor also declares the unique inverse relationship. The explicit `commandResolutions_node_push` unique index covers `(nodeId, pushIndex)`.

`appendExposedCommands` is the sole insertion writer. Supported code never updates/deletes these rows or inserts a child independently. Retry/public readers join by the parent position; private recovery scopes by Node/session and captured Service position, proves the producer prefix, then reads later private commands.

| Column         | Meaning, writer/readers and null rule                                                                                                                                                               | Necessity and removal consequence                                                                                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serviceIndex` | Required primary/reference key identifying the public parent. Append writes it with the child; immutable retry, public/private joins and captured-N private bounds use it.                          | Retain the association and one-to-one integrity. This is not another independent resolution ID. Removing it loses which command owns the private facts and whether they belong at or before snapshot N. Parent ID/name/hash/delta need no repeated child columns. |
| `nodeId`       | Required original producing Node identity. Recovery selects it and disclosure checks it; the complete publication schema requires nonempty text.                                                    | Retain. Different Nodes can share actor identity, session and claims. Neither owner nor current socket state reconstructs the original producer. It is not a WebSocket connection ID.                                                                             |
| `pushIndex`    | Required producer command-stream position, validated as a positive safe integer. Unique with Node; private recovery proves and pages its contiguous sequence.                                       | Retain. Other commands interleave in global `serviceIndex`; canonical ID/public position cannot derive the producer sequence. Removing it loses private gap detection and resolved progress.                                                                      |
| `sessionName`  | Required exact admitted session definition, validated as nonempty. Recovery scope and private disclosure match it.                                                                                  | Retain. The actor partition can serve multiple session definitions. Node/path alone cannot locally supply the historical session without another retained relation or remote reconstruction. This is not an ephemeral tab instance.                               |
| `claims`       | Required JSON record containing complete original encoded application claims. Prefix checks inspect the full retained record; payload disclosure compares the reconstructed recipient structurally. | Retain. Actor path contains only partition identity fields. Current credentials, path-only claims or a subset cannot replace original authority context. Repetition across submissions does not justify a separate Node-claims registry/lifecycle.                |
| `failure`      | Nullable complete public refusal, copied for an owned source Failure; null records an owned successful resolution. Read only after recipient filtering; immutable retries compare it exactly.       | Retain. Empty delta or disposition hash cannot recover refusal contents. This is the recipient's command resolution, not delivery diagnostics. A success still needs a row to advance the private prefix.                                                         |

The schema's non-null/key constraints do not themselves require nonempty Node/session strings or positive safe pushes; the complete pending publication codec supplies those checks at append. The unique Node/push pair expresses one resolution per admitted producer submission. Adding session/claims to that uniqueness would allow duplicate Node positions rather than strengthen identity. No extra prefix counter, status field or index is justified by this review.

- [Exact columns/key/index](../../../packages/system-worker/src/ServiceActorVersionChain/serviceActorVersionChainDbConfig.ts#L14-L44), [complete recipient protocol](../../../packages/core/src/contracts/CommandResolutionSchema.ts#L5-L15), [validated atomic child writer](../../../packages/system-worker/src/ServiceActorVersionChain/appendExposedCommands.ts#L34-L118), [direct prefix proof](https://github.com/morgs32/zerospin/blob/15e505c3322dad08504946923e0c15f4fb1768e9/packages/system-worker/src/ServiceActorVersionChain/getResolvedThrough/getResolvedThrough.ts#L24-L74), [private payload paging](https://github.com/morgs32/zerospin/blob/15e505c3322dad08504946923e0c15f4fb1768e9/packages/system-worker/src/ServiceActorVersionChain/readServiceBrowserCommandPage.ts#L162-L217), [exact disclosure](../../../packages/core/src/serviceSession/filterServiceBrowserCommand.ts#L44-L69).

### Every structured claims and failure value

`claims` is `Record<string, unknown>` with application-defined keys and encoded values. The fixed table defines no additional universal claim fields. Authored claim codecs govern the values. Canonical actor path decoding reconstructs identity fields; it cannot recover all historical non-path claims. Structural equality must not treat JSON object property order as different authority, and mismatching historical claims must not be silently filtered away.

When non-null, `failure` retains the shared public-error envelope:

| Field     | Meaning, null/absence and removal consequence                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `_tag`    | Required literal `ZerospinError`, identifying the shared public error. It is not the source outcome's `Failure` branch tag.                |
| `code`    | Required stable machine-readable error code, needed for exact recognition.                                                                 |
| `scope`   | Optional `contract`, `actor` or `aggregate` namespace. Omission is valid; the actor owner cannot infer it.                                 |
| `message` | Required frozen readable refusal text. A later declaration/message is not a substitute.                                                    |
| `status`  | Required number or null. Null is a public-status absence, not Success or a missing resolution.                                             |
| `extra`   | Required JSON detail, including legitimate JSON null. Preserve the authored structured error payload without adding generic nested fields. |

There is no full source outcome, successful result, timestamp, operation body or repeated command identity inside the child. These belong to their established source/public owners rather than private recipient history.

- [Claims/failure declaration](../../../packages/system-worker/src/ServiceActorVersionChain/serviceActorVersionChainDbConfig.ts#L29-L35), [every public refusal field](../../../packages/error/src/matchZerospinErrorCode.ts#L27-L36), [canonical identity subset](../../../packages/system-worker/src/serviceProjection/resolveServiceActorView.ts#L18-L62), [historical structural claims proof](https://github.com/morgs32/zerospin/blob/15e505c3322dad08504946923e0c15f4fb1768e9/packages/system-worker/src/ServiceActorVersionChain/getResolvedThrough/getResolvedThrough.ts#L45-L74).

### Absence, Success and immutable association

1. No child row means this actor publication owns no private producer resolution. It does not establish source Success or an unfinished publication.
2. A child with `failure: null` records this producer's owned successful resolution, including no-op Success.
3. A child with a public failure records this producer's owned refusal.

The parent append seals that exact resolution **or its absence**. Retry compares the public command and resolution-or-null together; later attachment, removal or changed recipient/refusal metadata conflicts. There is no independent child insertion RPC, queue or acknowledgement. A new success flag, resolution ID or lifecycle discriminator adds no fact.

- [Immutable joined comparison](../../../packages/system-worker/src/ServiceActorVersionChain/appendExposedCommands.ts#L62-L103), [one synchronous public/private insert](../../../packages/system-worker/src/ServiceActorVersionChain/appendExposedCommands.ts#L105-L118).

## Private prefix, privacy and captured Service bound

`getResolvedThrough` validates bound actor name/version and nonnegative safe private/Service cursors. Null Node permits only a zero private offset and returns a zero prefix. For a real Node, its SQL scope is exact Node and `serviceIndex <= throughServiceIndex`. It rejects any retained sessionName mismatch or full-claims mismatch before prefix/private-offset checks, including offset zero, matching Aggregate recovery-request validation. An unknown Node or a bound before its retained history still returns zero at offset zero. This is defensive caller validation; it introduces no valid normal Node rebinding path.

The prefix query reads `commandResolutions` directly. Bidirectional `json_tree` EXCEPT compares full historical claims structurally, including earlier rows before the requested offset. Session/claims mismatches fail rather than disappear through a session/claims WHERE filter. For validated positive pushes, `COUNT(*) = COUNT(DISTINCT pushIndex) = MAX(pushIndex)` proves the complete `1..resolvedThrough` prefix. The reader also rejects a requested private offset beyond that prefix; using MAX alone would lose the gap proof.

`readServiceNodeOutcomes` calls that scalar proof before joining public history for at most 64 later private rows. It orders by Service position and verifies each next producer push, Node, session and full claims again before model/refusal filtering. Those joined public commands are required for actual private replay. Browser commands omit retained recipient metadata and disclose refusal only to the exact actor/version/Node/session/full-claims recipient. The scalar reader does not verify public checkpoint existence or decode public commands; snapshot capture separately checks the exact history checkpoint.

Snapshot capture fixes selected resources and local head N together, publishes through N and compares exactly N's receiving history checkpoint/hash before private recovery through the same N. Socket recovery maintains its own private `outcomeIndex`, separately from public `serviceIndex`. A newer public tip cannot advance the captured snapshot's private prefix.

- [Initial identity/cursor/null-Node checks](https://github.com/morgs32/zerospin/blob/15e505c3322dad08504946923e0c15f4fb1768e9/packages/system-worker/src/ServiceActorVersionChain/getResolvedThrough/getResolvedThrough.ts#L24-L44), [scoped structural claims/complete-prefix proof](https://github.com/morgs32/zerospin/blob/15e505c3322dad08504946923e0c15f4fb1768e9/packages/system-worker/src/ServiceActorVersionChain/getResolvedThrough/getResolvedThrough.ts#L45-L74), [necessary joined payload phase](https://github.com/morgs32/zerospin/blob/15e505c3322dad08504946923e0c15f4fb1768e9/packages/system-worker/src/ServiceActorVersionChain/readServiceBrowserCommandPage.ts#L172-L217), [browser filtering](../../../packages/core/src/serviceSession/filterServiceBrowserCommand.ts#L26-L69), [captured-N publication/recovery](../../../packages/system-worker/src/serviceProjection/captureServiceSnapshot.ts#L83-L138).

## Recovery-request validation amendment — 2026-10-22

Service now inspects all resolutions belonging to the requested Node within the
captured Service bound and rejects any retained sessionName or full-claims
mismatch before prefix/offset checks, even at private offset zero. Unknown Nodes,
no bounded history and null-Node behavior retain their existing zero-prefix rules.
No schema, index, retention or Node lifecycle changes are introduced. Source
build/typecheck/lint, shared test typecheck and all 45 focused runtime cases passed.
The existing SQLite cases cover wrong sessions at zero/positive offsets, earlier
session mismatch despite a matching latest resolution, and a valid bound before
the mismatched history. The completed Plan 217 evidence below remains historical
evidence for its original scope.

## Source-review reader-cleanup finding — before Plan 217

At the 2026-10-16 source review, the prefix proof already used only private rows, but every call then materialized a public command page even when the caller needed only the scalar:

1. `captureServiceSnapshot` called the Chain's `getNodeOutcomes` RPC. It supplied `afterOutcomeIndex: 0`, the captured Service bound and model bindings, then used only `recovery.resolvedThrough`. Joined commands and `outcomeThrough` were discarded.
2. `readServiceNodeOutcomes` therefore joined/decoded historical public deltas and model-filtered up to 64 commands solely to produce an unused page for that snapshot.
3. Socket replay had three further scalar-only probes: its initial validation call discarded the result; the read after public delivery used only `resolvedThrough`; the final-tail probe used only that same scalar. One separate call genuinely sent private command payloads and needed to retain the joined reader.

**Recommend `getResolvedThrough` for scalar consumers**, backed by a focused direct `commandResolutions` prefix procedure shared with the necessary payload reader. Replace the scalar-only snapshot RPC/call with that method and remove its obsolete RPC wrapper/interface when no longer used. Keep the local private payload reader and its public join for actual socket delivery; do not delete all Node-outcome reads or their required payload preparation.

The cleanup must preserve exact actor/version/Node/session/full-claims checks, null-Node semantics, safe captured Service bound, complete historical claims inspection and count/distinct/max prefix proof. Actual private-cursor consumers must still reject invalid/too-large `afterOutcomeIndex`/`outcomeIndex`; replacing a validation-only page call with an unchecked scalar would weaken resume validation. Remove model/public-delta arguments only from scalar reads, and change no schema, index, retention, source acknowledgement or socket ordering.

This was observed unnecessary decoding and reader coupling, not a measured latency result or a correctness/privacy incident. The earlier Aggregate cleanup provided context; the actual Service snapshot/socket consumers independently established this finding. The maintainer subsequently approved this bounded cleanup under Plan 217; its implementation and current verification work are recorded below.

Current successors to the reviewed calls:

- [Direct scalar reader](https://github.com/morgs32/zerospin/blob/15e505c3322dad08504946923e0c15f4fb1768e9/packages/system-worker/src/ServiceActorVersionChain/getResolvedThrough/getResolvedThrough.ts#L17-L74), [Chain RPC method](../../../packages/system-worker/src/ServiceActorVersionChain/ServiceActorVersionChain.ts#L75-L84), [snapshot scalar call](../../../packages/system-worker/src/serviceProjection/captureServiceSnapshot.ts#L121-L133), [private proof followed by required payload page](https://github.com/morgs32/zerospin/blob/15e505c3322dad08504946923e0c15f4fb1768e9/packages/system-worker/src/ServiceActorVersionChain/readServiceBrowserCommandPage.ts#L172-L217).
- [Initial scalar validation](../../../packages/system-worker/src/ServiceActorVersionChain/onMessage/replayServiceSocketCommands.ts#L78-L88), [actual private payload delivery](../../../packages/system-worker/src/ServiceActorVersionChain/onMessage/replayServiceSocketCommands.ts#L98-L110), [post-delivery scalar use](../../../packages/system-worker/src/ServiceActorVersionChain/onMessage/replayServiceSocketCommands.ts#L131-L137), [final-tail scalar use](../../../packages/system-worker/src/ServiceActorVersionChain/onMessage/replayServiceSocketCommands.ts#L161-L168).

## Commit, acknowledgement and retention

ServiceActorVersionRepo commits resources/head/complete pending selected publication synchronously. ServiceActorVersionChain then validates exact source-owner equality, complete publication and contiguous public progress before atomically retaining the parent and optional child. A later failure rolls back the page's new inserts. Exact retries compare the joined immutable publication, including absent child.

Only a successful receiving envelope permits pending outbox deletion. Retained private history survives that acknowledgement. Broadcast follows commit, and isolated socket failures cannot undo the resolution. No supported UPDATE, DELETE, pruning or expiry exists for `commandResolutions`.

**Deletion condition:** none in the supported lifecycle. Keep private rows for this physical Chain's lifetime. Browser receipt, socket closure, source acknowledgement and private resolved progress do not authorize deletion. Removing children independently of parents breaks private recovery and changes the sealed publication compared by retries. No TTL or Node/release retirement policy is introduced.

- [Producer ownership/frozen publication](../../../packages/system-worker/src/serviceProjection/applyEvaluatedCommandsTx.ts#L38-L74), [resource/head/pending transaction](../../../packages/system-worker/src/serviceProjection/applyServiceProjectionCommandsTx.ts), [retained atomic append](../../../packages/system-worker/src/ServiceActorVersionChain/appendExposedCommands.ts#L19-L118), [synchronous rollback](../../../packages/core/src/drizzle/make/makeTx.ts#L69-L120), [success before pending acknowledgement](../../../packages/core/src/outbox/makeOutboxDelivery.ts#L288-L296), [pending-only deletion](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts#L225-L235), [post-commit broadcast](../../../packages/system-worker/src/ServiceActorVersionChain/ServiceActorVersionChain.ts#L47-L64).

## Approved implementation — 2026-10-16

[Plan 217](../../archive/plans/217-plan-service-direct-resolution-prefix-read.md) replaces the scalar-only `getNodeOutcomes` RPC and its forwarding module with `getResolvedThrough`. The shared synchronous reader queries only `commandResolutions` and returns the proved numeric prefix. ServiceActorVersionChain binds its own database/key and adapts the synchronous read at its RPC boundary. `captureServiceSnapshot` uses the same captured N after publication/checkpoint comparison, supplies private offset zero and no longer requests models or payloads for this read.

The direct reader retains exact actor name/version, safe nonnegative private/Service bounds, null-Node semantics, exact Node/session scope, full historical structural claims comparison, count/distinct/max prefix proof and rejection of offsets beyond the prefix. `readServiceNodeOutcomes` calls that proof before its required bounded public join and recipient/model filtering. Three scalar-only socket probes call the direct reader with their existing private offset; the one actual private replay payload read remains. The final tail read/send/live transition remains synchronous in source.

Affected READMEs and Plan 151 record this change separately from the original finding. No schema, index, retention, connection-lock or other owner storage change is part of Plan 217; no new ADR/glossary term is introduced.

Verification was explicitly deferred when implementation was written. That implementation record is not passing evidence. No reset, deployment or commit was performed.

## Plan 217 verification — 2026-10-22

Historical verification completed as part of Plan 151. The retired `repo-names.spec.ts` SQL cases and `agent-runtime.spec.ts` Workerd cases below record that checkpoint, including its pass count and fixture limits. Current verification uses the real Durable Objects in [service-actor-prefix.workerd.spec.ts](../../../packages/system-worker/tests/workerd/service-actor-prefix.workerd.spec.ts), with the migration tracked in [Plan 257](../../archive/plans/257-plan-direct-system-worker-verifications.md). The three historical Effect-native SQL cases used disposable SQLite, the actual ServiceActorVersionChain schema and `appendExposedCommands`:

1. Exact Actor binding, captured Service bounds including zero, Node/session isolation, null Node and private-cursor validation. Deliberately malformed public delta data leaves the direct scalar read usable while both payload readers still reject decoding.
2. Nested-object key reordering preserves full claims equality; missing or extra nested claims reject even when all affected resolutions precede the private offset. Mixed history with an earlier mismatched resolution and a matching latest resolution also rejects. A positive push gap rejects rather than returning its maximum, while a captured bound before that gap remains valid.
3. Private replay retains owned refusal payloads and private offsets; public replay hides foreign-Node or full-claims-mismatched refusals. Both readers filter upserted/deleted resources to admitted models and return only the six browser-command fields.

Two cases passed in the retired `agent-runtime.spec.ts` Workerd seam:

1. A deterministic fixture hook pauses before ServiceActorVersionChain's real exact-N checkpoint read while N+1 commits; the actual snapshot path preserves resources/head/hash/private prefix at captured N. The fixture can return an explicit selected-Chain Failure envelope (`exposed-command-invalid`) instead of appending; that receipt prevents the scalar read. A fixture-modified conflicting checkpoint receipt also rejects before the scalar read.
2. A deterministic fixture hook synchronously appends position 65 through the production append procedure after sending the first 64-command frame. The actual ServiceActorVersionChain socket path delivers that final tail, rejects an overlarge private offset before command frames, replays private payloads behind a retained public checkpoint, sends replay completion before marking live and then receives the next live command.

At that checkpoint, the scoped Nx compiler/library graph and all 59 tests across eight files passed. Independent review closed the mixed historical-claims proof gap and found no production defect. All 54 captured production modules remained unchanged; qualified historical comparison preserved the resolution declaration and index while separating Plan 218's co-landed connection-lock changes. Final lint/documentation checks are recorded in Plan 217. That Workerd seam used trusted Actor publication inputs and fixture connection bootstrap; its explicit Failure receipt and deterministic hooks did not prove raw network failure recovery, authenticated Actor admission, ticket admission, automatic activation, socket hibernation or the full connection-capability/disposal lifecycle. [Plan 218](../../archive/plans/218-plan-service-connection-capabilities-and-disposal.md) and [Plan 221](../../archive/plans/221-plan-session-ticket-admission-cleanup.md) retain their independent obligations. Plan 217 records completion separately; parent Plan 151 remains active.

## Reconciliation and verification limits

Both independent reviewers support all six columns/current constraints and permanent optional-child history. Both independently identify unused public-command materialization in snapshot/prefix-only consumers and support the bounded direct-prefix cleanup. No schema change or ordinary-path correctness/privacy defect was identified. The private payload reader remains necessary for actual replay; the recommendation does not collapse private resolution into public history or alter its authority checks.

The original source-review turn changed only this finding and Plan 151; it changed no production code/schema, tests, fixtures, runners, configuration or storage and ran no verification. The later Plan 217 implementation and completed verification are recorded separately. Plans 196/211/212/213 remain active and unverified. Plans 214/215/216 have since completed the scoped verification recorded in their archived plans; the remaining connection/ticket work retains its own obligations. No reset or deployment is performed or proposed.

**Next table in this review sequence:** ServiceActorVersionChain.connectionLocks. Its connection-capability and teardown obligations remain separate under Plan 218.
