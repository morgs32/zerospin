# 112 — Agent session replica, producer journal and connection owners

1. **Implementation status:** implemented and verified in the approved goal on 2026-10-11.
2. **Method shape:** establish inputs, run named domain steps in order, and return the owned result. Helpers own behavior and invariants; moving an entire monolith to a differently named file does not satisfy this plan.

3. **Problem and evidence**
   1. At review time, [bootstrapAggregateAgentSession](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/browser/src/bootstrapAggregateAgentSession.ts#L60) was 1,206 lines combining resource conversion, SQLite provisioning, session publication, staged-command discovery, producer position allocation, admission/rejection recovery, snapshot import, HTTP bootstrap and socket dispatch. Its nested callbacks directly rewrite the journal and projection. These are three cohesive owners, not one bootstrap phase.
   2. Archived Plan 103 already provides tagged aggregate messages, exact admission receipts, receipt-or-missing snapshot reconciliation and atomic pending-command rebase. Archived Plan 100 already owns lazy application execution and session disposal. This plan preserves those fixes while making ownership visible.
4. **Proposed model**
   1. `AgentReplica` owns the transient SQLite client, declared resource tables, projection/session execution capability and failure observation for one session lifetime. Reconnecting retains it; ending the lifetime discards it. The agent remains Studio-only and aggregate-bound; executable authored declarations remain in the project-root shared agent module.
   2. `AgentCommandJournal` owns producer metadata, staged command ordering, one-time push-index allocation, admitted prefix and admission refusal recovery. It receives the replica's typed database/session declaration and never acquires sockets or executes host requests. It returns typed submission/reconciliation results and emits committed failures through the existing failure stream.
   3. `AgentConnection` owns first usable replay, HTTP/ticket bootstrap, retry and socket attempt state. It dispatches already decoded messages to journal/projection procedures. It depends on the scoped socket-attempt owner from the connected-worker plan rather than implementing a second timer/cancellation framework.
5. **Parent shape and exact procedures**

   ```ts
   const bootstrapAggregateAgentSession = Effect.fn(
     'bootstrapAggregateAgentSession',
   )(function* (props: IAgentBootstrapProps) {
     const binding = decodeAgentSessionBinding(props);
     const replica = yield* openAgentReplica(binding);
     const journal = makeAgentCommandJournal(replica);
     const connection = yield* connectAgentSession({
       binding,
       replica,
       journal,
     });
     yield* connection.awaitFirstUsableReplay();
     return makeAgentSessionControls({ replica, journal, connection });
   });
   const rejectAgentSubmission = Effect.fn('rejectAgentSubmission')(function* (
     props: IAgentAdmissionRejection,
   ) {
     const rejected = validatePendingAgentSubmission(props);
     yield* rejectAgentSubmissionTx(rejected);
     publishCommittedAgentFailure(rejected);
   });
   ```

   1. `openAgentReplica` acquires/provisions the transient DB and command indexes, creates the session identity, installs the scoped failure observer and returns its typed journal/projection APIs. Client acquisition is interruption-safe: late acquisition is closed without publication. Its finalizer drains connection/command work before client close, following the existing lifetime work/resource scope order.
   2. `nextAgentSubmissionTx` returns the oldest still-pending original from this producer; allocates its push index only when absent; advances nextPushIndex in the same synchronous transaction; validates safe integer bounds. Preserve original payload and provenance. Repeated sends reuse the original command and position.
   3. `applyAgentCommandPageTx` imports the decoded ordered authoritative page and recomputes projection/acknowledgment in one transaction through core session procedures. Operation interpretation belongs to the separate operation-codec plan. Do not fork core replay logic.
   4. `reconcileAgentAdmissionTx` validates producer identity, command ID, allocated push position and admitted prefix before advancing it. Index mismatch recovery may lower only the reversible producer prefix and cannot contradict a retained final outcome.
   5. `rejectAgentSubmissionTx` validates the currently pending original, rewinds optimism, removes the refused original, compacts later allocated producer positions, updates nextPushIndex and replays the survivors atomically. A refused submission consumes no canonical producer position. If any decode, SQL or replay step fails, every journal/projection mutation rolls back; no failure event is emitted as if committed.
   6. `connectAgentSession` receives a fixed binding, replica and journal; returns readiness and controls plus an owned finalizer. State-required requests a fresh snapshot; transport unavailability retries. Invalid initial declaration/storage/snapshot remains terminal. Adopt [Plan118](118-plan-version-result-owner.md)'s canonical `aggregateIndex`/`dispositionHash` and keep the independent node `outcomeIndex`/`resolvedThrough` prefix. Replay completion must match both the canonical checkpoint/hash and the privately owned contiguous outcome prefix before making the session writable. Under [Plan119](119-plan-selected-view-owner.md) and [Plan124](124-plan-session-snapshot.md), a requested snapshot boundary is a minimum: import the actual atomically captured resource checkpoint/hash/private prefix, which may have advanced before capture, then resume from that captured position. Never label newer snapshot resources with the earlier requested boundary or restore redundant executed cursor aliases.

6. **Intentional changes and removals**
   1. Move the inline DB/table configuration into an authored agent replica module. Remove socket callback SQL, duplicated originating-command failure maps and parallel socket/admission/replay timer cleanup from the bootstrap. Replace them with the named owners; do not export a large untyped context bag.
   2. Retain transient storage, public release/session method signatures, selected-view privacy, precise read/write readiness, admitted-prefix semantics and local-origin failure correlation. No new durable actor, server agent registry, schema migration or compatibility path is introduced.
   3. Internally, every connection retirement settles its local waiters immediately and drains their SQL work before replica disposal. Public observer exceptions continue to be isolated after committed work; they do not undo acceptance or emit a second failure.
7. **Source hierarchy** (`+` create, `~` modify, `-` delete)
   ```text
   ~ packages/browser/src/bootstrapAggregateAgentSession.ts
   + packages/browser/src/agentSession/agentReplicaDbConfig.ts
   + packages/browser/src/agentSession/openAgentReplica.ts
   + packages/browser/src/agentSession/makeAgentCommandJournal.ts
   + packages/browser/src/agentSession/nextAgentSubmissionTx.ts
   + packages/browser/src/agentSession/reconcileAgentAdmissionTx.ts
   + packages/browser/src/agentSession/rejectAgentSubmissionTx.ts
   + packages/browser/src/agentSession/connectAgentSession.ts
   ~ packages/browser/src/Node/makeSessionFailureObserver.ts
   ~ packages/browser/src/makeBrowserSession/createAggregateAgentBrowserSession.ts
   ~ packages/browser/src/sessionRelease/README.md
   ```
   There are no deleted standalone source files: obsolete embedded machinery is deleted from the bootstrap. The hierarchy is rooted at `zerospin/`.
8. **Ordered implementation and dependencies**
   1. Land or coordinate scoped socket attempts and the operation-codec owner first. Inspect current core journal/replay helpers; use them rather than recreating their transactions.
   2. Establish replica acquisition and journal interfaces, extracting producer metadata and rejection transactions with explicit inputs/outputs. Preserve current fixed schemas unless a separately justified model change is approved; a changed fixed schema requires empty storage.
   3. Move transport dispatch to the connection owner and invoke the journal/projection procedures in message order. Make first usable completion and disposal children of the current session lifetime.
   4. Reduce bootstrap to the shown steps, remove replaced state/maps/timers, and update its constructor and documentation in the same cutover.
9. **Acceptance and existing verification**
   1. A retry after lost admission acknowledgment sends the exact same original and producer position. Refusal removes only the refused original; later producer positions and optimistic resources remain consistent. Retained authoritative finals are never reexecuted as new originals.
   2. Every snapshot/page/refusal transaction either commits its complete journal/projection change or leaves the previous complete view. Readiness is withheld until exact replay completion; auth clear/dispose prevents publication and new commands from stale callbacks.
   3. Failure events are emitted once for the matching locally originated command after commitment; telemetry/observer failure cannot alter the result. Reconnect preserves the transient replica and producer journal; disposal clears all resources and awaits connection work.
   4. Use resolved `browser:lib`, `browser:ts`, `browser:lint` and affected core/React tasks through Nx. No permanent browser test/check suite exists. Reuse the actual Studio agent preview and established aggregate HTTP/WebSocket/RPC seams for live replay, refusal and interrupted disposal; no new fixture, runner or test configuration. Browserless journal exercises can verify rollback/ordering but cannot prove live Studio/socket ownership. Record unavailable host evidence explicitly.

10. **Cross-plan ownership:** [105](105-plan-immutable-authored-declarations.md) owns immutable authored declarations; [106](106-plan-canonical-authored-manifest-projections.md) owns manifest/lock projections; [107](107-plan-contract-evaluation-phases.md) owns prepared contract inputs/evaluation; [108](108-plan-model-operation-codecs.md) owns strict resource and operation codecs; [109](109-plan-bound-database-definition.md) owns schema/index provisioning; [110](110-plan-sqlite-execution-and-commit-observation.md) owns committed SQL/table notifications. Use those owners where applicable and do not recreate them in this refactor. The server service-protocol/result-journal proposals own their wire/cursor hard cutovers.

11. **Documentation lifecycle:** after implementation, reconcile affected package READMEs, architecture citations and `wiki/glossary.md` against actual source. Create or supersede an ADR only for a qualifying implemented decision with a consequential tradeoff; do not manufacture an ADR for extraction. Preserve completed Plans 100/103 as historical evidence. Archive this plan only after its acceptance criteria and available verification are complete, recording remaining environmental limitations accurately.

## Implementation progress — 2026-10-11

Bootstrap now composes a scoped transient replica, transaction-owned producer command journal and one long-lived connection Fiber. Reconnect retains the client and original journal; the owner serializes all socket events and retries. Admission/refusal decisions commit in journal transactions, and replay completion checks public aggregate index/hash plus the private contiguous outcome prefix before publishing writes. Unexpected initial terminal failure remains owned by bootstrap; later connection failures are observed by the connection owner.

Browser/React/Studio `lib`, `ts` and `lint` passed in `/tmp/zerospin-goal-quality-8.log`; scoped edited-file lint also passed. The assigned aggregate command workflow and package lifecycle README describe the current journal/connection owners. The actual public Studio bootstrap and real agent HTTP/WebSocket ownership checks below supplement these source gates; they use controlled disposable host boundaries rather than the locked desktop Studio UI.

### Authorized controlled acquisition — 2026-10-11

The human authorized disposable `/tmp` verification. With the actual production agent session lifecycle and real WASM SQLite factory, client acquisition was held while disposal was requested twice. Publication was synchronously withheld; the same dispose completion waited for that native acquisition, then closed SQLite exactly once. No HTTP bootstrap or execution capability was published, initialization rejected and the connection remained disposed. The runner joined with exit0 (`/tmp/zerospin-framework-goal-tooling-112-acquisition.log`).

The producer's two correlated final predicates also had the established Drizzle single-table qualification defect: an inner aliased `id` could selfbind instead of correlating to the outer original. `pending` and `observeOriginals` now use the existing explicit qualified final predicate. This changes neither the persisted schema nor admission authority/transactions. The fresh integrated source graph passes. Real first-final→next-original delivery and foreign-final preservation of an own pending original both pass below.

### Authorized actual agent and journal checks — 2026-10-11

The disposable runner uses production `createAggregateAgentBrowserSession`, Studio `executeStudioRequest`, the real WASM SQLite factory, and the genuine isolated Workerd administrative agent declaration and registered aggregate owner. Its temporary transport wrapper controls delivery of real messages; it creates no admission receipts or authoritative finals. The following runners completed with exit0:

- `/tmp/zerospin-framework-goal-tooling-112-cancel.log`: a genuinely obtained bootstrap response was held while the owner was disposed. Disposal settled locally without the frozen provider, closed SQLite once, rejected initialization, and prevented the late response from publishing a writable capability or staging commands.
- `/tmp/zerospin-framework-goal-tooling-112-loss.log`: withholding the real replay completion withheld initialization and writes. A transport loss before delivery retried the unchanged original and producer position. For the committed lost-acknowledgment case, an untouched genuine snapshot and unused bound ticket were captured before later admission; the fixture delivered that captured response on reconnect while actual execution was held. The server resumed the earlier checkpoint and received the byte-equal admitted original at the same push2. Releasing actual execution produced exactly one final at public10, after the previous command's public9 final. The transient client and session identity survived both attempts; disposal closed SQLite and removed every owned transport listener. A fresh snapshot acquisition legitimately waits while execution/catch-up is held; that setup is not evidence of a retry defect.
- `/tmp/zerospin-framework-goal-tooling-112-refusal.log`: altering only the outgoing contract-version envelope produced the real server's `aggregate-session-command-contract-unavailable` refusal before admission. The journal removed only the matching original, compacted an already allocated surviving push2 to push1, retained its optimistic resource34, and emitted its matching failure once. The genuine survivor then finalized at its reclaimed push1, proving refusal consumed no producer position. Disposal fenced a late real replay callback, joined its scoped owner, closed the actual client, and removed all exact listener identities. Withdrawal of selected resources is a local staging constraint; an already staged valid administrative command is not automatically refused for that reason.
- `/tmp/zerospin-framework-goal-tooling-112-journal.log`: a real SQLite delete-abort trigger left commands, both metadata owners, resources, and optimism completely unchanged and emitted no failure. Removing the trigger committed refusal compaction/replay, and a throwing observer could not alter the result or duplicate the matching event. A gapped authoritative page rolled back completely. Two retained genuine foreign pages advanced public4/hash then public5/hash while preserving the own pending original, private0, and optimistic resource32; repeated delivery was idempotent. Together with the actual first-final→next-original socket case, this verifies both repaired correlated predicates.

The checks prove production session/SQLite/HTTP/WebSocket ownership with explicit controlled host timing. They do not assert native Chrome window events or a mounted desktop Studio preview; those are not substituted for any unrun lifecycle criterion. All fixture sockets and runners ended, and the server remained owned by the separate verification agent. No repository test, fixture, runner, configuration, schema, or compatibility path was introduced.

## Remaining work

None.
