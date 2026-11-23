# Why the Service-agent attempt became too large

**Date:** 2026-10-18. **Status:** Implementation erased at the user's request; no replacement implementation has started. Plan 242 was canceled and removed, not completed or verified. The previously committed `recoveryRegistry` work remains intact.

**Evidence:** Compared the discarded working tree with HEAD `c34bda675d0eedac2aab01c158068ed3ea4ba278`, with independent core, backend and browser/API reviews. Links pin that commit and survive rollback. Discarded-code observations identify captured paths/ranges below. This is source research, not runtime verification or a new implementation plan.

## Finding

The attempt combined Service-agent support with family-neutral APIs, an ordinary Service-actor protocol migration, actor subsystem extraction, Shopping's immutable version rollout, Studio routing changes and documentation resynchronization. It became a session-framework refactor around a new feature.

The main avoidable cost was generalizing boundaries whose callers already knew the family. The local rule favors explicit domain methods with one signature each, while allowing shared internal construction. A discriminated discovery registry does not require polymorphic constructors, locks or execution APIs. [Pattern][explicit-methods].

## Size, without counting moves as new functionality

The attempt affected **204 paths: 124 tracked paths, including 17 deletions, plus 80 new files**. The 187-file snapshot counted files still present. The tracked diff was `+2,378/-2,877`, excluding 6,156 lines in new files. These raw measurements include copying, relocation, formatting and docs.

For example, `serviceSessionChain/` had 20 files and 1,640 lines, but 15 were moved actor helpers: 1,294 baseline lines became 1,345. The new browser path added 13 files/1,403 lines; Shopping added 17 files/1,202 lines. Those are different sources of size, not one large new algorithm.

## Avoidable widening

**1. Family constructors became wrappers over a neutral boundary.** HEAD's Aggregate constructor directly owns Aggregate identity, selection capture and canonical model/contract checks; its contract metadata is Aggregate-specific. [Constructor][aggregate-constructor], [contract metadata][agent-contract].

The discarded `makeAgentSessionRelease.ts:40-72,123-129` accepted Aggregate-or-Service props and selected schemas/predicates by `kind`. The already separately named Aggregate/Service constructors forwarded into it. `makeAgentContract.ts:14-45` likewise widened to both contract families, propagating family generics into existing Aggregate callers. This was responsibility overloading, even without TypeScript overload syntax. Explicit `makeAggregateAgentContract` and `makeServiceAgentContract` boundaries would keep authority visible; small capture/binding procedures can still be shared.

**2. Ordinary actor locks changed for an agent feature.** HEAD's Service lock is an actor-only format. [Lock schema][actor-lock], [construction][actor-lock-construction]. The discarded constructor accepted actor or agent releases and branched on:

```ts
'claimsSchema' in sessionRelease; // actor versus agent
'db' in sessionRelease; // two model layouts
```

That changed existing actor lock fields into an `origin` union, forcing ordinary ServiceAccessApi, ServiceSessionApi and five existing browser files to narrow actor types. `makeServiceSessionSpec`, which only accepts an actor definition, then needed to reject the agent branch introduced by its own helper. Existing actor history claims also became nullable, changing fixed storage. A dedicated Service-agent lock and private-resolution schema could avoid this actor migration. Agent Origin support for actual Service commands remains necessary.

**3. Reuse became an actor-tree relocation.** The backend moved 15 actor helpers, added a 218-line `ServiceSessionChain`, and turned actor and agent Durable Objects into forwarding shells. `IServiceProjectionKey` then carried actor-or-agent identity through projection, fanout, publication, broadcasting, history and snapshot dispatch (`resolveServiceProjectionView.ts:90-121`; `applyExecutionPacketsTx.ts:60-76`).

There was a real Aggregate precedent: AggregateAgentVersionChain already delegates to AggregateSessionChain. [Existing delegation][aggregate-delegation]. That precedent does not require relocating existing Service actors. Explicit boundaries can resolve their identity/selection and reuse existing selected-read, bound-operation, delta, hash and queue procedures. Sharing an algorithm need not make every downstream method discriminate its owner.

**4. Existing overload patterns were copied rather than challenged.** `makeBrowserSession` and `replayServiceCommandTx` were already overloaded at HEAD; the attempt widened them. [Browser factory][browser-construction], [Service replay][service-replay]. New Service-agent staging, snapshot import, command import and replay copied a generic declaration plus an erased implementation using `unknown`; the metadata reader copied two public shapes, required-row versus `allowMissing`. These are different from cross-family dispatch, but both violate the requested single-signature direction. Inherited machinery is not justification for adding more of it.

## Necessary Service work

HEAD's Service Origin supports actors/System and ServiceVersionChain only has actor fanout. Service-agent authority and delivery therefore genuinely need implementation. [Origin][service-origin], [fanout][service-fanout]. A correct feature still requires:

- Exact Service-agent identity and canonical contract allowance, administrative bootstrap and single-use socket tickets, without synthetic actors or claims.
- A materialization Repo, retained-history Chain and agent fanout; atomic resources/checkpoint/complete publication, recovery protection and deletion only after durable acknowledgement.
- A transient browser journal with bound snapshots, optimistic replay, private outcomes independent of selection membership, reconnect and disposal.

Those responsibilities cannot disappear through renaming Aggregate code. Their public boundaries can remain explicitly Aggregate-agent or Service-agent shaped.

## Other multipliers

The browser imitation copied substantial transport, telemetry, producer and journal machinery while also expanding the neutral browser factory. Reusing cohesive private lifecycle/transport procedures would reduce parallel maintenance without widening public authority. Studio additionally replaced existing Aggregate URLs with family routes; adding a Service route did not require moving the existing Aggregate route. [Baseline routes][studio-routes]. The generic row inspector was worth retaining. Its reconnect state must survive temporary capability withholding so a retained outcome remains visible after the row exits the selection; its database capability must remain lifetime-owned.

Shopping's selected rollout was separate work: the baseline promotion helper pins Service 1.0 and derives IDs without receiving-version identity. Preserving old requests while introducing 1.1 produced immutable external versions and User/session/agent binding updates. [Pinned request][promotion-request]. This explains much of the 23-file Shopping scope; it is not inherent Service-agent construction complexity. Documentation changes across 11 paths added ownership amendments plus diagram/citation/SHA churn, further increasing review volume.

A later restart should retain explicit `makeAggregateAgent*`/`makeServiceAgent*` APIs with one signature, preserve ordinary actor protocols unless directly required, and share narrow procedures with already-resolved inputs. The discarded attempt paid for wider APIs and migrations than this feature required. None of its implementation is retained by this report.

## Rollback result

Restored all 124 tracked paths to the baseline and removed the 80 implementation-created files. Rebuilt the affected libraries from restored sources; the eight requested library builds and their dependencies passed, and discarded Service-agent output directories are absent. Tracked files and the index match HEAD. This research note is the only remaining repository change. Existing local storage was left untouched; its previously reported incompatibility and the deferred regression-fixture failures are separate from this rollback.

[explicit-methods]: https://github.com/morgs32/zerospin/blob/c34bda675d0eedac2aab01c158068ed3ea4ba278/wiki/patterns/typescript/explicit-domain-methods-no-overloads.ts#L8-L17
[aggregate-constructor]: https://github.com/morgs32/zerospin/blob/c34bda675d0eedac2aab01c158068ed3ea4ba278/packages/core/src/agent/makeAggregateAgentSessionRelease.ts#L37-L149
[agent-contract]: https://github.com/morgs32/zerospin/blob/c34bda675d0eedac2aab01c158068ed3ea4ba278/packages/core/src/agent/makeAgentContract.ts#L12-L77
[actor-lock]: https://github.com/morgs32/zerospin/blob/c34bda675d0eedac2aab01c158068ed3ea4ba278/packages/core/src/serviceSession/ServiceSessionLockSchema.ts#L5-L18
[actor-lock-construction]: https://github.com/morgs32/zerospin/blob/c34bda675d0eedac2aab01c158068ed3ea4ba278/packages/core/src/serviceSession/make/makeServiceSessionLock.ts#L11-L22
[aggregate-delegation]: https://github.com/morgs32/zerospin/blob/c34bda675d0eedac2aab01c158068ed3ea4ba278/packages/system-worker/src/AggregateAgentVersionChain/AggregateAgentVersionChain.ts#L14-L92
[browser-construction]: https://github.com/morgs32/zerospin/blob/c34bda675d0eedac2aab01c158068ed3ea4ba278/packages/browser/src/makeBrowserSession/makeBrowserSession.ts#L14-L63
[service-replay]: https://github.com/morgs32/zerospin/blob/c34bda675d0eedac2aab01c158068ed3ea4ba278/packages/core/src/sessionExecution/replayServiceCommandTx.ts#L15-L49
[studio-routes]: https://github.com/morgs32/zerospin/blob/c34bda675d0eedac2aab01c158068ed3ea4ba278/packages/studio/src/main.tsx#L13-L28
[service-origin]: https://github.com/morgs32/zerospin/blob/c34bda675d0eedac2aab01c158068ed3ea4ba278/packages/core/src/contracts/ServiceCommandOriginSchema.ts#L3-L9
[service-fanout]: https://github.com/morgs32/zerospin/blob/c34bda675d0eedac2aab01c158068ed3ea4ba278/packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts#L89-L148
[promotion-request]: https://github.com/morgs32/zerospin/blob/c34bda675d0eedac2aab01c158068ed3ea4ba278/examples/shopping/src/zerospin/aggregates/user/contracts/utils/requestPromotionCommand.ts#L22-L45
