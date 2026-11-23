# Canonical results and selected Chain ownership

**Agent callback amendment — Plan 309 (2026-11-17):** [ADR 029](029-independent-agent-command-callbacks.md) supersedes Agent embedding, selection replay, attempted-wake scheduling and replacement/initialization clauses. Agent projections compute selected deltas from owner history. Stable execution Repos own selected-model tables, pending rule deadlines and pending delivery for the current installation. Other ownership and retention responsibilities remain governing.

**Agent release amendment — Plan 262 (2026-10-25):** Agent declaration identity, release selection, upgrade scheduling, wake-marker identity and observer binding clauses below are superseded by [ADR 021](021-independent-agent-releases.md). Other ownership and retention decisions remain governing.

**Date:** 2026-10-11
**Status:** Combined ownership superseded for Aggregate by [ADR 013](./013-aggregate-delivery-history-and-projection-ownership.md) and for Service by [ADR 015](./015-service-delivery-history-and-projection-ownership.md). Accepted for the independent identity, browser-lifetime, privacy and catalogue guarantees below.
**Agent amendment — Plan 151 (2026-10-21):** Agent definitions, catalogue identity and browser lifetime follow the unversioned observer/Node Repo decision in ADRs [013](013-aggregate-delivery-history-and-projection-ownership.md) and [015](015-service-delivery-history-and-projection-ownership.md). It supersedes the Agent producer, optimism and private completion requirements below; Actor guarantees remain governing. Runtime verification remains with the active plans.
**Implementation:** Plans 118, 119 and 131 in the [framework refactor review](../reviews/2026-10-11-framework-rearchitecture.md).
**Supersedes:** [ADR 004 — versioned agent selected views](./004-versioned-agent-selected-views.md) and [ADR 006 — browser speculation and confirmed projections](./006-browser-speculation-and-confirmed-projections.md).

The combined-owner and minimum-snapshot decisions below are historical. ADR 013 governs Aggregate ownership; ADR 015 governs Service ownership. Activation-owned current committed reads follow completed Plan 192. The independent identity, privacy, browser lifetime and catalogue guarantees remain in force.

## Context

Separate same-identity VersionRepo/VersionChain owners copied each committed result through an outbox before it could be read. Selected Repo/Chain pairs likewise copied projection output before retaining browser history. Those transfers duplicated progress, acknowledgement, retries and storage for one durable fact. The duplication did not provide an independent authority boundary.

## Historical ownership decision

AggregateVersionRepo and ServiceVersionRepo each own their canonical resource state, immutable result journal and associated ordered model/async output. The shared input position, `aggregateIndex` or `serviceIndex`, is also the sole confirmed result position. Results retain source and execution release identity plus `dispositionChainHash`. Original/replay authority and order remain governed by [ADR 005](./005-ordered-original-execution-and-finalized-replay.md); only originals produce external work under [ADR 001](./001-async-replay-retains-output-without-production.md).

AggregateActorVersionChain, AggregateAgentVersionChain and ServiceActorVersionChain own their selected resource graphs, checkpoints, browser histories and sockets. A receiving transaction validates canonical output, applies operations, computes selected deltas and retains browser output with the new checkpoint. Full local resources remain necessary for relational selection. Browser snapshots/deltas expose only selected rows. A snapshot request supplies a minimum; one local transaction captures actual resources, checkpoint and the requesting Node's private resolved prefix.

Broadcast occurs after commit. A failed socket send closes that attachment without undoing committed history or its source acknowledgement. Reconnect reads retained history. Subscriber progress/failure and recovery alarms remain durable where histories cross genuinely distinct source/selected owners. There is no same-identity publication outbox or second confirmed execution cursor.

Browser sessions stage immediate local overlays. AggregateNode and ServiceNode own shared pending optimism; sessions install their coherent views and replay only their own uncovered originals. Transient AggregateAgentNode and ServiceAgentNode own selected rows/checkpoints; their Sessions observe that Node without a second replica or command journal. Aggregate sockets admit unchanged originals to AggregateChain; canonical release policies and contract programs decide authoritative outcomes. Service ordinary actor guards retain their scope. Recorded external continuations use their distinct producer authority.

Actors retain exact versioned identities. Register one unversioned Agent at
`system.agents[agentName]`, pinning an exact Aggregate or Service release.
Selected-view identity includes owner family/name/version and Agent name, plus
Aggregate instance where applicable. SystemRepo freezes the Agent selection and
capability meaning under that owner release. Changing it requires advancing the
owner release, without an Agent version or active selector. Aggregate Agent
sessions select a registered Aggregate ID; Service Agent sessions select their
registered Service owner. Browser construction uses explicit family constructors.
Agents borrow no Actor claims or authentication; Studio's credentials and
single-use bound tickets govern observation. Observer nodeId binds ticket/resume.

SystemRepo retains immutable comparison definitions in `acceptedDefinitions`, keyed by a canonical tagged JSON tuple. Actor identities exclude enclosing release version, so reuse across releases cannot change an accepted actor version. Full releases and agents retain their own immutable definitions. Equal reacceptance is idempotent; omissions do not delete accepted entries. Registration requires prior equal acceptance and cannot add definitions. The catalogue never reconstructs executable callbacks.

## Transient Agent lifetime amendment — Plans 249/151

One open Studio Agent Session owns one main-thread memory AggregateAgentNode or
ServiceAgentNode. Its exact definition/owner/session and observer nodeId remain
bound through reconnect. Each snapshot/delta and checkpoint commit in one
synchronous transaction. The guarded readSelection view is fenced during
reconciliation and retired on disposal. Reconnect can retain a stale read view;
first validated replay publishes ready. Browsers own no Agent journal, optimism,
wake timer, producer sequence or private completion recovery.

Automatic execution belongs to the separate unversioned AggregateAgentNodeRepo
or ServiceAgentNodeRepo under ADRs 013/015. Administrative credentials remain in
the Studio broker. SystemApi.openAgentSession reads a coherent public selected
snapshot directly and issues a bound observation ticket. Closing Studio cannot
stop automatic execution. This replaces the originating-input and private-prefix
parts of Plan 244; its historical checks do not prove the new runtime behavior.

## Catalogue storage amendment — Plan 220

This catalogue decision remains governing despite the partial ownership supersession above. SystemRepo.acceptedDefinitions stores exactly two required columns: unique text `key` and typed JSON `spec`. The key is the complete canonical tagged JSON tuple for an Aggregate release, Service release, Aggregate Actor, Service Actor, Aggregate Agent or Service Agent. Agent keys contain owner name/version and Agent name; the kind supplies owner family. Agent specs retain no independent version. Other specs retain their declaration versions; all retain the full projected portable definition. Complete release Actor definitions and separate Actor entries serve distinct full-release and cross-release immutability responsibilities.

Persist no duplicate `definition` envelope or identity. Acceptance strictly validates each logical `{ identity, spec }` before deriving its key and projecting the stored spec. Reads strictly validate the exact caller-supplied identity before key lookup, then reconstruct and strictly validate the logical envelope against that identity, including the matching branch, spec name and applicable owner/declaration versions. The spec-only codec must reject invalid fields without silently truncating overlapping Aggregate/Service shapes; every portable fact in the current declaration schema remains retained. Its object-record root preserves the strict union representation through canonical JSON-schema conversion; an unconstrained `Unknown` root loses that exported constraint. Plan 255 removes Service query registries outright: old `queries` fields are incompatible input, including empty registries. The canonical key supplies the durable ownership association instead of a second persisted identity comparison.

Equal reacceptance performs no rewrite; new entries and all retained comparisons share one synchronous acceptance transaction. Conflicts or malformed entries roll back the supplied batch, preserving full-spec, path-sensitive diagnostics. Registration remains require-only. Accepted definitions remain permanent across omissions and failed promotions, without updates, deletion, expiry or acknowledgement. Actor keys continue to exclude their enclosing release version.

[Plan 220](../archive/plans/220-plan-accepted-definition-key-spec-storage.md) records the completed catalogue verification on 2026-10-23, including immutable acceptance, strict reads, batch rollback, Actor locks and require-only registration. The fixed-schema hard cutover requires empty affected SystemRepo storage; no compatibility decoder, translation migration or automatic reset is provided. [Plan 255](../archive/plans/255-plan-typed-system-service-reads.md) records the separately approved Service query-registry catalogue cutover. Its operational reset does not add a catalogue deletion lifecycle or authorize redefinition during normal acceptance. Ticket admission and broader Repo registration remain separate obligations.

## Alternatives

Keeping transfer outboxes preserves duplicate local histories and crash-recovery states. Renaming or embedding the old Repo leaves the same ambiguity. Keeping only selected resources would break relational membership; replaying programs in selected owners would introduce a second execution authority.

## Consequences

Canonical reads and local snapshots no longer wait for same-identity publication. Different selected identities still retain independent histories, subscriptions and, for Actors, private progress. This reduces durable owners while preserving ordered replay and receiver recovery. Removed namespaces, tables and cursor fields are a hard cutover requiring empty affected fixed storage; there are no translations, aliases or fallback readers.
