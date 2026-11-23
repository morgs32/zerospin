# Handoff for prototyping release history on PR #176

**Date** 2026-11-19  
**Focus** Prototype Aggregate release branching and rebuilding on `codex/owner-worker-integration` and update [PR #176](https://github.com/morgs32/zerospin/pull/176).

## Decision

Owner release Workers are a viable way forward. The maintainer has chosen this architecture for Zerospin. Build for fresh Systems and update consumer implementations to the new contract. Retire the superseded architecture as its callers are replaced. Existing deployments, Durable Object namespaces, stored data and old consumer behavior impose no compatibility or migration requirements on this work. This decision concerns the software design; it requires no operational action against a running consumer System.

One stable Worker per System owns ingress, registration, `AggregateChain` and `ServiceChain`. A command's addressed owner release selects its execution Worker. The Chain owns admission and original outcome acknowledgement. The owner Repo owns the synchronous model transaction and pending publication. Today the Chain adopts published history from the configured `canonical` release. The agreed direction removes that selection and gives each release an explicit history predecessor. The Aggregate prototype is the next step. The design of historical reads after the Chain clears its local rows is still open.

## Done

1. Shopping started clean at `user@1`, then registered `user@2` and `user@3` on the same local System. Each release executed `addToCart@1` on the same cart. Quantity advanced 1 → 2 → 3 while `user@1` stayed canonical. All three Repos reached head 3. Their Archives agreed on IDs, positions, addressed releases and finalization times. Earlier executable pins survived the restarts. [Shopping walkthrough](../../examples/shopping/README.md#run-user-releases-against-one-cart)
2. In Workerd, `user@3` committed position 2 before publication and before the stable Chain acknowledged it. Position 3 remained admitted. After Repo eviction the existing alarms recovered the saved outcome, operations and disposition hash, drained publication and executed position 3 once. [Repeatable recovery case](https://github.com/morgs32/zerospin/blob/ade99772fafbd6be56d7a7208e9e68883f0b8413/packages/system-worker/tests/remote-down-adapter/remote-down-adapter.workerd.spec.ts)
3. In the prototype, `AggregateChain` resolves the private release binding, calls `OwnerReleaseWorker.getAggregateVersionRepo(key)`, then delivers the admitted command through `finalizeCommandSubscriber.receive`. Queries, session authorization and replay resolve the same owner-local Repo. Service original execution, VersionChains and Archives still run on the stable Worker. Live Cloudflare deployment is unverified. [Owner entrypoint](../../packages/production-worker/src/OwnerReleaseWorker.ts) · [Repo lookup](../../packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts) · [Replay coverage](../research/remote-down-adapter-replay.md#workerd-prototype)
4. PR #176 contains the runnable checkpoint and dev-history integration. At `79be3266de` Shopping uses direct SDK release declarations. The PR reports passing Shopping typecheck and 16 tests. Its live progression, interrupted-command recovery and connected-browser reopen checks were skipped on the integrated branch at the maintainer’s request. Use [the PR](https://github.com/morgs32/zerospin/pull/176) for current status.
5. The release terms and first-use decision are recorded in the [glossary](../glossary.md#aggregate-release-predecessor). The [source trace](../research/aggregate-chain-original-delivery-and-finalized-history.md) identifies original delivery, replay reads, compaction and the remote adapter call at the PR head examined.

## Aggregate prototype

1. Shopping uses direct `makeAggregateRelease` calls. `user@2` declares `branchFrom: userAggregateReleaseV1` and `user@3` declares `rebuildFrom: userAggregateReleaseV2`. `makeSystem` checks both reference modes against the same Aggregate registry at compile time and runtime. SystemSpec retains the predecessor version. [Shopping walkthrough](../../examples/shopping/README.md#run-user-releases-against-one-cart)
2. `AggregateChain.prepareAggregatePredecessor` stores the cart's finalized position in a synchronous transaction before waiting for the predecessor. `AggregateVersionRepo` reads Archive-backed `AggregateVersionChain` pages capped at that position. A branch applies and republishes inherited evaluated commands. A rebuild evaluates the same admitted prefix with the receiving release's programs, including commands its predecessor inherited. The original delivery outbox still routes each admitted command by its addressed version, and configured releases continue replaying.
3. Workerd exercised Shopping with a compacted position, read that command through `AggregateChain`, and observed quantities 1, 2 and 6 on one cart. A second Workerd exercise paused delivery to `user@3`. The Chain admitted position 3 while the Repo was still at position 1. After eviction of `AggregateChain` and `user@3`'s Repo, both persisted predecessor points stayed at position 1. `user@3` replayed position 2 and executed its original at position 3. `user@2` replayed that command and reached quantity 3. The existing Aggregate history suite separately verified compaction, lost publication acknowledgement and Archive reads after eviction.
4. The replay path asks the original owner executable to validate the recorded Actor identity, grant and claims and prepare the payload. It also validates a System command whose original release is missing from the receiving executable. Once validated, a command without a receiving contract advances that release with an unsupported outcome. The development CLI journals the executable association before `SystemRepo.acceptSystemSpec` and checks durable acceptance after an interrupted startup. Owner Worker startup requires the journal layout and refuses earlier or mixed layouts before selecting bundles. The added remote-adapter Workerd suite and its dedicated configuration were removed because the originating chats did not authorize them.

## Remaining

1. Choose the durable source of finalized Aggregate command inputs after removing `canonical`. The prototype still uses the canonical publication acknowledgement to compact `AggregateChain`. After deletion, exact and paged Chain reads resolve the retained prefix through the adopted `AggregateVersionChain` and its Archives. An original admitted after a replay gap first looks up its own local admitted command, then pulls finalized predecessors via the same paged Chain read before execution. A rebuild reads its predecessor's published prefix and verifies each admitted command against the Chain. [Exact and paged reads](../research/aggregate-chain-original-delivery-and-finalized-history.md#when-aggregatechain-fetches-history)
2. Define release retirement for omitted owners with admitted originals or persisted branch dependencies. The configured predecessor rule covers ordinary fanout for the prototype.
3. Carry forward Service execution, VersionChain and Archive placement, Agent integration, consumer cutover and fresh deployment verification. [Owner Worker design](../research/self-hosted-system-releases.spike.ts)

## Open decisions

1. Which published history can satisfy each remaining Chain read after canonical adoption is removed, and what permits compaction? A per-command release locator and a second full Chain archive were suggestions. Neither has been selected.
2. The branch prototype reconstructs state by applying predecessor operations with matching model versions, then publishes the inherited prefix. Snapshot retention, shared prefixes and schema conversion remain open. A cold predecessor runs its ordinary activation catch-up before receiving the bounded catch-up request, so an error after the fixed point can delay initialization until the required position is published.
3. Does this PR also complete replay adaptation for recorded external commands? The Actor finding is confirmed. The external case must preserve the recorded provider response and its inclusion in this PR remains open. [Adapter research](../research/remote-down-adapter-replay.md)
4. A session and background fanout can both activate a Repo. Both now resolve the same persisted predecessor point. Any future policy that gives one path priority must preserve that property.

## Suggested skills

1. `$implement` for the runnable prototype and scoped verification in the existing PR worktree.
2. `$grill-with-docs` and `$rubber-duck` for unresolved ownership decisions exposed by the prototype.
3. `$pr` for the PR update and `$code-review` for reviewing the implementation against the agreed behavior.
