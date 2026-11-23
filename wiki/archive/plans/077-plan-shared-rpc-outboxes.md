# Shared RPC outboxes

Status: Completed and verified on 2026-10-09.

## Problem and baseline evidence

1. [The server outbox](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts) combines ordered page delivery, retries, failure diagnostics, and exact-page acknowledgement with Cloudflare `RpcTarget`, the configured system runtime, and Durable Object alarm recovery. Its required `deliver(rows)` callback does not express the receiver capability in the queue contract.
2. [Server subscribers](../../../packages/system-worker/src/makeOutboxSubscriber/makeOutboxSubscriber.ts) already expose named capabilities with a prototype `receive(rows)` method and an `IRpcEnvelope<void, IZerospinErrorJson>` response. [Fanout subscribers](../../../packages/system-worker/src/makeFanoutSubscriber/makeFanoutSubscriber.ts) use the same naming arrangement: the owner names the subscriber capability, and the capability has a plain `receive` method.
3. [Aggregate bootstrap](../../../packages/browser/src/bootstrapAggregateSession.ts) observes committed command-table changes, starts asynchronous handoffs, imports returned acceptance records, and retries uncertain handoffs on reconnection. Its command-copy map also participates in recovery. [Service bootstrap](../../../packages/browser/src/bootstrapServiceSession.ts) commits staging through its execution binding and awaits the handoff directly; it likewise retains uncertain command copies for reconnect recovery.
4. The aggregate and service browser RPC APIs call `AggregateNode.accept` or `ServiceNode.accept`, return retained command records directly, and start server synchronization separately. They use Cap'n Web rather than Cloudflare's RPC base class. Both sender session databases are in memory; the receiving Nodes use persistent browser SQLite storage. Sharing delivery machinery must preserve that ownership and durability boundary.
5. The [existing receipt importers](../../../packages/core/src/aggregateSession/importAggregateNodeCommands.ts) and [service importer](../../../packages/core/src/serviceSession/importServiceNodeCommands.ts) transactionally attach Node coordinates to staging and retain execution records. These imported coordinates already distinguish work retained by the worker from local work still awaiting handoff. A separate browser delivery table is unnecessary for this extraction.
6. [ADR 003](../../adrs/003-immutable-node-command-history-and-submission-order.md) governs immutable Node phases, independent submission ordering, cursor-neutral point recovery, and acknowledgement after local import. [ADR 004](../../adrs/004-standalone-authority-and-storage-scope.md) governs standalone ownership. Both remain reference constraints; this plan does not change their storage or authority decisions.

## Agreed scope and behaviour

1. Extract shared outbox delivery machinery and adopt it in the existing server outboxes and both aggregate and service session-to-SharedWorker handoffs. Keep aggregate/service orchestration, actor identity checks, model codecs, staging, and optimistic replay with their existing owners.
2. Bind an explicit typed RPC subscriber. Use paired `IOutboxQueue<...>` and `IOutboxSubscriber<QUEUE>` contracts that infer both the delivered row type and the successful receipt type. Name the subscriber capability; its method is `receive(rows)`, not a domain-suffixed `receive*` method.
3. All outbox subscriber `receive` methods return `IRpcEnvelope<Receipt, IZerospinErrorJson>`. Preserve `void` where the existing server receiver needs no receipt data. Browser receivers return their concrete retained command records inside the success envelope. Server staging/admission queues retain any admission receipt data their acknowledgement needs.
4. Commit source changes before invoking RPC. Run delivery outside local database transactions and domain execution gates. After a valid success receipt, the sender performs its own local acknowledgement transaction. Browser receipt import preserves retained command history; server acknowledgement removes only the selected pending delivery rows.
5. Preserve the [standard retry schedule](../../../packages/core/src/utils/defaultRetrySchedule.ts): three total receiver attempts with exponential delays starting at 250 ms. Once a browser delivery exhausts these attempts, retain the pending command and wait for another originating command commit. That commit wakes delivery of the oldest pending work first. Do not schedule another retry timer after the burst.
6. Reconnection still restores the attachment and its inbound subscription. It may import worker-retained records, but it must not restart an exhausted outbound drain by itself. Receipt imports, foreign commands, progress updates, and ordinary table notifications are not new originating commits and must not bypass the agreed wakeup rule. Within an already running retry burst, resolve the current attachment for each attempt.
7. Server queues retain their alarm recovery, including recovery after cold activation and interruption. Browser queues exist only within the current session lifetime. Disposal, sign-out, or a blocked session prevents further delivery and fences late receipts; no new browser persistence or background execution guarantee is introduced.
8. Preserve public SDK completion semantics: aggregate staging returns synchronously after local commit; service staging resolves successfully only after its own command is retained by the worker and the acceptance receipt has been imported. A successful earlier drain is not confirmation of a later service command.
9. Replace superseded RPC handoff paths outright. Remove `AggregateBrowserSessionApi.accept`, `ServiceBrowserSessionApi.accept`, their direct callers, and obsolete delivery/reconnect loops. Retain the core `AggregateNode.accept` and `ServiceNode.accept` methods, which still own local retention and are not alternate RPC paths. Keep unrelated standalone RPC and execution behaviour unchanged.
10. Fanout, SharedWorker-to-server WebSocket synchronization, server push/pause controls, application UI, and agent/standalone delivery orchestration are outside scope. Preserve unrelated work in the dirty checkout. Do not migrate or clear user storage; no fixed-schema change is planned. If implementation reveals a required schema or authority change, resolve that material choice before proceeding.

## Contracts and ownership

1. `IOutboxQueue` describes one named source queue, its delivered rows, its receipt type, and its local delivery operations. `IOutboxSubscriber<QUEUE>` derives the corresponding `receive` input and receipt. Keep these structural contracts free of a specific RPC base class; concrete Cloudflare and Cap'n Web capabilities satisfy them. Type inference must preserve a `void` receipt exactly and reject mismatched rows or receipts without casts.
2. Distinguish stored rows from delivered rows. Existing server callbacks reconstruct async continuations, attach operation bodies, normalize browser command delivery, and carry owner-version provenance. Keep that preparation with the owner and infer the resulting delivery type. Do not assume a Drizzle row is already the receiver's wire input, persist duplicate serialized payloads, or erase differing shapes into `unknown`.
3. The shared engine requires a resolver for the bound typed subscriber and invokes its `receive` method itself. Owner hooks may prepare rows and commit acknowledgements; they must not retain an unconstrained callback that performs arbitrary delivery in place of the subscriber contract.
4. Shared machinery owns delivery serialization, ordered page selection, bounded draining, receiver retries, envelope decoding, and exact selected-page acknowledgement coordination. Storage hooks retain stable source indices. Runtime wrappers supply pending reads, payload preparation, acknowledgement/failure writes, capability acquisition/release, and runtime execution. Durable Object wrappers additionally own recovery arming and alarm leases.
5. Keep browser-safe shared code under `packages/core/src/outbox/`. Keep the existing Durable Object constructors as concrete runtime wrappers that delegate to the shared engine, rather than maintaining a second drain implementation. Cap'n Web subscriber construction and the session database adapter live under `packages/browser/src/outbox/`. Do not extract a generic aggregate/service Node runtime.
6. Use `stagedCommandOutbox` for each browser session's local queue and `stagedCommandSubscriber` for the named capability on its worker attachment. The conceptual RPC call is:

   ```ts
   const subscriber = await attached.stagedCommandSubscriber;
   const envelope = await subscriber.receive([command]);
   ```

7. Browser subscriber factories create actual Cap'n Web RPC capabilities with `receive` on the prototype. Each subscriber retains its parent attachment's identity and lifecycle checks. Retaining the nested capability must not preserve authority after the parent is detached, signed out, or replaced. Start server synchronization separately after Node retention, preserving the existing acceptance-versus-server-execution distinction.
8. Browser source selection uses existing command rows for the current session: originating staging without worker coordinates and without an executed counterpart is pending. Read in `sessionIndex` order. Receipt import supplies worker coordinates and removes the command from this pending selection while retaining history. Use single-command browser pages initially, preserving the existing command-level retention and receipt semantics.
9. Delivery may succeed remotely before its reply is lost. Retrying the same command ID must return retained records without allocating another Node record or submission position. A local receipt-import failure leaves source work pending and ends that drain; a subsequent allowed wake may redeliver it idempotently. Point receipts remain cursor-neutral, and executions ahead of the tab's checkpoint wait for ordered inbound delivery.
10. Server receipt handling and removal of the selected outbox rows belong in one acknowledgement transaction when both require writes. Payload preparation and RPC calls stay outside that transaction. For a partially retained receiver page followed by failure, the source retains the complete selected page; receivers must continue tolerating committed-prefix redelivery.
11. Preserve the Durable Object producer/alarm invariant: recovery is armed before source production; producer success, failure, and interruption all start delivery once production has begun; overlapping producers and producer revisions prevent premature alarm release. A bounded drain with later pending rows retains recovery. Do not persist retry counters, retry schedules, or a second queue-position allocator.
12. In the browser, distinguish a new originating commit from the table notification that merely reports receipt import or replay. Track observed originating commits within the current source lifetime and coalesce wakeups after the committing stack returns. A new commit during an in-flight drain must remain an effective wakeup even if the older delivery fails. Pending SQL rows are authoritative; remove command copies used as an independent recovery queue. Preserve uncertainty/failure observability with runtime-only state where needed.

## Planned file hierarchy

Legend: `+` create; `~` modify. Documentation entries are post-implementation work. Existing files must be re-read before editing because concurrent work is active.

```text
zerospin/
├── packages/
│   ├── core/
│   │   ├── ~ package.json
│   │   ├── ~ tsconfig.etc.json
│   │   ├── src/outbox/
│   │   │   ├── + IOutboxQueue.ts
│   │   │   ├── + IOutboxSubscriber.ts
│   │   │   └── + makeOutboxDelivery.ts
│   │   ├── test/
│   │   │   └── + outbox.node.spec.mjs
│   │   └── typecheck/
│   │       └── + outbox.typecheck.ts
│   ├── browser/
│   │   ├── src/
│   │   │   ├── ~ bootstrapAggregateSession.ts
│   │   │   ├── ~ bootstrapServiceSession.ts
│   │   │   ├── AggregateNode/
│   │   │   │   └── ~ AggregateBrowserSessionApi.ts
│   │   │   ├── ServiceNode/
│   │   │   │   └── ~ ServiceBrowserSessionApi.ts
│   │   │   └── outbox/
│   │   │       ├── + makeOutboxSubscriber.ts
│   │   │       └── + makeSessionCommandOutbox.ts
│   │   ├── test/
│   │   │   └── + outbox-api.node.spec.mjs
│   │   └── e2e/
│   │       ├── + session-outbox.playwright.spec.ts
│   │       └── session-outbox-fixture/
│   │           ├── + declarations.ts
│   │           ├── + index.html
│   │           ├── + main.ts
│   │           └── + worker.ts
│   └── system-worker/
│       ├── ~ package.json
│       ├── src/
│       │   ├── makeOutboxQueue/
│       │   │   └── ~ makeOutboxQueue.ts
│       │   ├── makeOutboxSubscriber/
│       │   │   └── ~ makeOutboxSubscriber.ts
│       │   ├── AggregateVersionRepo/
│       │   │   └── ~ AggregateVersionRepo.ts
│       │   ├── ServiceVersionRepo/
│       │   │   └── ~ ServiceVersionRepo.ts
│       │   ├── AggregateProjectionRepo/
│       │   │   ├── ~ AggregateProjectionRepo.ts
│       │   │   └── optimistic/
│       │   │       └── ~ makeStagedAggregateCommandOutbox.ts
│       │   ├── ServiceActorVersionRepo/
│       │   │   └── ~ ServiceActorVersionRepo.ts
│       │   ├── AggregateChain/
│       │   │   └── ~ AggregateChain.ts
│       │   ├── ServiceChain/
│       │   │   └── ~ ServiceChain.ts
│       │   ├── AggregateVersionChain/
│       │   │   └── ~ AggregateVersionChain.ts
│       │   ├── AggregateProjectionChain/
│       │   │   └── ~ AggregateProjectionChain.ts
│       │   ├── ServiceVersionChain/
│       │   │   └── ~ ServiceVersionChain.ts
│       │   └── ServiceActorVersionChain/
│       │       └── ~ ServiceActorVersionChain.ts
│       └── checks/outbox/
│           ├── + config.ts
│           ├── + run.mjs
│           ├── + worker.ts
│           └── + wrangler.jsonc
└── wiki/
    ├── plans/
    │   └── + 077-plan-shared-rpc-outboxes.md
    ├── ~ glossary.md
    ├── architecture/
    │   ├── ~ AuthoredSystem.md
    │   └── browser/
    │       ├── ~ bootstrapBrowserSession.md
    │       ├── ~ AggregateCommandLifecycle.md
    │       └── ~ PushSequence.md
    └── patterns/system-worker/
        └── ~ i-fanout-repo.ts
```

## Implementation steps

1. Re-read the listed source and current package/test configuration. Preserve concurrent changes, particularly the browser test-lane migration and architecture edits. Confirm that this remains an extraction with unchanged fixed schemas and existing identity/lifetime boundaries. Use the existing source-module exports and workspace dependencies; add no package or transport.
2. Declare the paired shared contracts and type inference in their defining files. Add compiler-checked examples for browser retained-record receipts, server `void` receipts, and admission receipts. Model delivered rows separately from stored rows. Replace the unused or superseded outbox interface declarations in the runtime factories without compatibility aliases; leave fanout contracts untouched.
3. Extract the shared delivery engine. Resolve the typed subscriber, prepare the selected delivery page, call `receive`, decode the envelope with the existing `readRpcEnvelope`, and invoke owner acknowledgement using the captured page and inferred receipt. Serialize drains and preserve bounded-drain semantics. Receiver failures and transport failures retain pending work; local acknowledgement failure does not claim success. Keep the original source index and producer revision semantics wherever they protect wakeups.
4. Make the existing server queue/subscriber factories thin Cloudflare wrappers. Generalize subscriber successful receipts beyond `void`. Preserve the configured runtime, telemetry, `AsyncLive`, disposal, diagnostics, source-production finalizers, and alarm behaviour. Route default SQL and existing custom storage paths through the one shared engine. Remove the duplicated drain body.
5. Cut over every server outbox producer and receiver listed in the hierarchy. Existing executed/browser-command subscribers keep their named accessors and receive semantics. Async continuation and staged admission queues that currently call admission RPCs directly gain named outbox subscriber capabilities on their receiving chains. These capabilities delegate to the existing domain admission operations and return the necessary typed receipts; they do not implement a second admission path or weaken validation. Move original-source receipt updates into the acknowledgement transaction with exact pending-row removal where applicable. Preserve immutable external responses, owner-version provenance, and selected operation bodies.
6. Add the Cap'n Web subscriber factory and expose `stagedCommandSubscriber` from both browser attachment APIs. Decode the complete row array at this RPC boundary before downstream work, retain commands through the existing `AggregateNode` or `ServiceNode` operations, return the retained-record receipt envelope, and start server synchronization separately. Remove the public `accept` methods and their entries from the picked API types. Keep parent-attachment fencing effective for nested subscriber references.
7. Adapt aggregate bootstrap to the shared session outbox. Preserve synchronous local staging and deferred delivery after commit. Select pending commands from current SQL, use the current attachment's named subscriber, validate matching receipt records, and import them through the existing recovery transaction. Replace the independent fork/reconnect delivery loops. Stop outbound retries after the bounded burst until a new originating commit; inbound subscription recovery remains active.
8. Adapt service bootstrap to the same engine and pending-row model. Its staging binding must await delivery through that command's source position and successful local receipt import. Do not return success merely because another drain is already running or an older command finished. Preserve service result decoding, rollback, failure callbacks, claims, and session readiness. Remove the command-copy recovery loop and apply the same commit-driven wake policy as aggregate bootstrap.
9. Finalize source lifecycle handling. Coalesce legitimate producer wakeups without treating acknowledgement writes, subscription records, or state changes as new producers. Retain pending work across failed attempts, preserve a commit arriving during an active drain, and prevent late acknowledgements from modifying a disposed/replaced source. Release acquired RPC references according to their runtime ownership without disposing the parent session connection.
10. Implement and run the verification below. Add only the scoped standard Node and Workerd scripts needed where no current owning lane exists; reuse the browser Node/Playwright lanes and the existing Wrangler fixture approach. Re-query Nx configuration after those scripts are added. Fix only failures attributable to this change and report unrelated blockers.
11. Perform the post-implementation documentation step, record actual verification results, and archive the plan only when implementation and required verification are complete. Follow the implement skill when implementation is requested.

## Verification seams and checks

1. Shared engine and authored types: add a small `node:test` lane to `@zerospin/core` and include the new typecheck file in its existing `ts` lane. Exercise valid rows and observable ordering, exact-page acknowledgement with concurrent appends, overlapping drain calls, bounded drains, typed failure envelopes, lost responses after receiver retention, local acknowledgement failure, and producer/wakeup races. Verify that `receive` runs outside a local transaction. Use deterministic gates and controlled time; do not test incidental helper call order. Compiler assertions reject wrong rows/receipts and retain the exact `void` success type.
2. Browser RPC boundary: use the current browser `test:node` lane to exercise the named Cap'n Web capabilities over MessagePort RPC. Assert successful retained-record receipts, mapped malformed-array/input failures with no downstream retention, transport failure handling, capability reachability, and sign-out/detachment/replacement fencing. Test malformed input here rather than fabricating invalid rows for the shared internal engine.
3. Browser/session integration: extend the existing Playwright fixture pattern for both domains, using real session databases, staging/importers, worker RPC capabilities, and Node persistence. Supply authored fixture declarations and controlled admission/synchronization dependencies without depending on Shopping or production credentials. Verify rollback creates no delivery; local aggregate success precedes worker reply; service success waits for its own retained receipt; command history survives acknowledgement; duplicate/lost replies allocate no new Node positions; and receipt/stream reordering preserves `afterNodeIndex`, checkpoints, replay, and notifications.
4. Browser failure liveness: fail all three receiver attempts for command A. Allow timers and inbound reconnect/state/receipt events to run and assert no fourth outbound attempt. Commit command B and assert A is attempted first, then B only after A is acknowledged. Repeat for aggregate and service sessions. Cover B committing during A's failing drain, local receipt-import rollback, disposal/sign-out during RPC, and an independently imported worker record clearing pending work without starting a new outbound retry. Prove there is no post-burst browser retry timer or reconnect-driven resend.
5. Durable Object integration: add a scoped `outbox:check` fixture using the existing `wrangler.unstable_dev`/temporary-storage approach. Exercise real Cloudflare RPC subscriber methods and synchronous sender acknowledgement transactions, committed-prefix redelivery, source rollback, concurrent producers, exact selected-row removal, failure diagnostics, alarm lease retention/release, and recovery after restarting with pending rows. Include a non-void admission receipt so transactionally updating the original command and removing pending work is tested, not merely typed.
6. Build and static checks: use one explicit-project Nx graph for `lib`, `ts`, and `lint` across `@zerospin/core`, `@zerospin/browser`, and `system-worker`, with required dependencies and normal caching. Build/typecheck affected SDK consumers through those dependencies and the browser fixture lane. The browser fixture build must succeed without `cloudflare:workers` or system configuration leaking into the shared engine.
7. Execution commands after adding the two scoped scripts and confirming their resolved configuration:

   ```sh
   pnpm nx run-many -t lib ts lint -p @zerospin/core @zerospin/browser system-worker
   pnpm nx run @zerospin/core:test:node
   pnpm nx run @zerospin/browser:test:node
   pnpm nx run system-worker:outbox:check
   pnpm nx run @zerospin/browser:test:playwright
   ```

8. At planning time, the browser Node and Playwright commands existed; core `test:node` and server `outbox:check` were proposed additions. Their implemented configuration and successful results are recorded below. Give both dependency execution and cache inputs matching their fixtures. Run invocations sequentially to avoid rebuilding shared outputs concurrently. Check formatting on the changed files only through the repository formatter. None of these implementation checks were run while writing this plan.
9. Inventory the final in-scope callers and docs. The worker handoff goes through named subscribers, the shared engine owns the only outbox drain implementation, old browser RPC `accept` paths are gone, and no timer or reconnect callback revives exhausted browser delivery. Core Node `accept`, standalone execution, and unrelated admission operations may retain their names because they still own different existing behaviour.

## Alternatives and rationale

1. Keep arbitrary `deliver(rows)` callbacks as the queue contract: rejected by the agreed design. Named typed subscriber capabilities make the receiver relationship and its acknowledgement contract visible and inferable.
2. Require one common `RpcTarget` base class: rejected. Cloudflare and Cap'n Web provide different runtime implementations. Structural paired interfaces express the shared RPC contract without pulling a server-only class into the browser.
3. Require domain-suffixed `receive*` methods: rejected. Follow the actual fanout convention of named subscriber capabilities with plain `receive`.
4. Standardize all successful receipts to `void`: rejected. Browser handoff needs retained records and server staging needs admission data. Inferred receipts preserve those domain facts and their local acknowledgement transactions.
5. Add a second browser delivery table or persist duplicate command bodies: not required. Existing staging rows and imported Node coordinates already define pending handoff while preserving history. Separate table schemas or payload persistence require a new justified decision.
6. Automatically schedule more browser retries after exhaustion: rejected by the user. A new originating commit resumes ordered pending delivery. Durable Object alarms remain necessary for their existing recovery contract and are supplied by the server runtime wrapper.
7. Share all aggregate/service orchestration or convert WebSocket synchronization/fanout to this outbox: outside scope. Sharing one delivery engine must not erase aggregate/service ownership, checkpoint semantics, or independently acknowledged subscriber histories.

## Post-implementation documentation

1. Reconcile the existing glossary with the implemented meanings of outbox, subscriber capability, receipt, and acknowledgement. Explain ownership and storage lifetime without describing in-memory session work as crash-durable. Distinguish source pending work from retained receiving history and unresolved optimistic staging. Do not update the glossary during planning.
2. Update the listed architecture pages and the outbox section of the existing fanout/outbox pattern against the resulting source, preserving concurrent edits and the unchanged fanout convention. Document browser wakeups, exhaustion, receipt transactions, current public SDK completion semantics, and server alarm recovery accurately.
3. Retain ADR 003 and ADR 004 as governing records. Create an ADR only if an implemented decision is hard to reverse, surprising without context, and reflects a real trade-off. This extraction does not itself justify a new ADR or a proposed/unimplemented decision record. If a governing decision actually changes, reconcile its successor and status after implementation.
4. Record implementation results, actual commands and outcomes, and any remaining limitations here. Archive the plan with its filename unchanged only after no required work remains. Repair relative links when archiving. Until then, this plan remains in `wiki/plans/`.

## Implementation outcome

1. Added browser-safe paired `IOutboxQueue` / `IOutboxSubscriber` contracts and `makeOutboxDelivery` under core. Stored rows and delivered rows remain distinct; subscriber inference preserves exact `void`, retained-record, and admission receipts. The engine owns serialized, ordered, bounded drains, the standard three receiver attempts, envelope decoding, and selected-page acknowledgement. Preparation and acknowledgement are outside the receiver retry schedule.
2. Cut over all eight server outboxes. `makeOutboxQueue` supplies SQL or owner storage hooks, failure diagnostics, exact-page synchronous acknowledgement transactions, runtime execution, and existing alarm/producer finalizers. New async and staged-admission subscriber capabilities delegate to the existing admission methods. Async subscribers return `void`; staged admission returns data needed by its original-command acknowledgement. Existing version/projection/actor chain subscribers already satisfied the generalized structural contract and required no changes. Removed unused old outbox interfaces and redundant SQL delivery/validation paths.
3. Aggregate and service attachment APIs now expose prototype `stagedCommandSubscriber.receive` capabilities with envelope receipts, whole-page boundary validation, and parent lifecycle fencing. Both bootstrap paths use SQL-backed `stagedCommandOutbox` selection with single-command pages and per-attempt current attachment resolution. Originating commits wake delivery after the commit stack; exhaustion waits for another originating commit, including one arriving during an older failed burst. Receipt imports, ordinary notifications, and reconnect refreshes cannot wake an exhausted burst. Disposal, blocked work, sign-out, and replacement fence late imports.
4. Preserved SDK completion: aggregate staging returns synchronously after local commit; service staging waits for its own retained receipt import. Receipt acknowledgement keeps immutable command history and cursor-neutral point recovery. The standalone connector adapts its existing receiver to the aggregate bootstrap's shared session engine; standalone RPC and execution ownership remain unchanged. No fixed schema, persisted retry metadata, package, transport, or storage migration was added. No new ADR was needed; ADRs 003 and 004 still govern.
5. Added compiler assertions, shared-engine Node checks, MessagePort boundary checks, a real browser/session/Node fixture for both domains, and a Workerd fixture using real RPC and durable SQLite. Added only the core Node and server outbox lanes; reused the concurrent browser lane migration. Resolved Nx configuration confirms fixture inputs, caching, library dependencies, and the browser lane's SDK consumer build. Lint depends on library output so simultaneous build/lint tasks do not race against cleaned package exports.
6. Updated the glossary, named architecture pages and diagrams, outbox pattern, result-envelope exception, and pattern index/method-folder references. Architecture source hashes were refreshed, relative links resolve, and every scoped sequence diagram has matching annotated messages. Preserved unrelated work, including the ongoing Explorer changes. Its concurrent catalog fixture still names the removed browser API `accept` method; Explorer checks remain owned by that separate work and are outside this plan's explicit project graph.

## Verified checks

All commands below completed successfully. Nx Cloud reported access code 401 after local completion; it did not fail the checks. The explicit-project lint graph reported zero errors and 49 existing warnings outside the changed source.

1. `pnpm nx run-many -t lib ts lint -p @zerospin/core @zerospin/browser system-worker` — passed the three project gates and required dependencies after final source cleanup. Compiler assertions reject mismatched rows and receipts and preserve `void` instead of narrowing it to `undefined`.
2. `pnpm nx run @zerospin/core:test:node` — 5 passed: ordered/bounded/overlapping drains, exact selected rows with concurrent appends, controlled retry delays and exhaustion, lost replies, local acknowledgement failure, and late receipt fencing.
3. `pnpm nx run @zerospin/browser:test:node` — 14 passed, including both named MessagePort capabilities, whole-array malformed-input rejection without retention, repeated receipts, transport failure, parent authority checks, initialized-session behavior, and existing standalone checks.
4. `pnpm nx run system-worker:outbox:check` — passed: real Cloudflare subscriber receipts, RPC outside producer transactions, synchronous source receipt/removal acknowledgement, source rollback, concurrent producers, committed-prefix redelivery, diagnostics, producer failure/interruption, bounded lease retention, acknowledgement rollback without receiver retry, and physical alarm dispatch after persisted restart.
5. `pnpm nx run @zerospin/browser:test:playwright` — 2 passed: both-domain session outboxes and the existing standalone suite. The outbox fixture verifies local aggregate completion, service per-command receipt completion, history retention, lost replies without allocator duplication, cursor-neutral point recovery followed by ordered execution and replay, three-attempt exhaustion with no event/timer resend, new-commit liveness and races, receipt-import rollback, independent inbound retention, and disposal/sign-out during RPC. Both fixture builds succeeded without server runtime imports leaking into the shared engine.
6. Scoped `pnpm exec oxfmt --check` — passed on the changed files. Scoped `git diff --check` passed. Caller inventory found no old aggregate/service RPC `accept`, copied recovery queues, reconnect drain loops, or old outbox interfaces in source. Core Node and standalone `accept` remain with their distinct existing owners.

## Remaining work

None.
