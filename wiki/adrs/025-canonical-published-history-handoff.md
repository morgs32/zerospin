# Adopt published canonical history from admission Chains

**Date:** 2026-10-27
**Status:** Accepted; implemented and behaviorally verified under [Plan 277](../archive/plans/277-plan-canonical-chain-history-handoff.md). All 40 source/package verification tasks passed, alongside 127 Workerd tests across 23 files and 77 Node tests across 20 files (204 tests total) with the complete test compiler. Only pre-existing, unrelated lint warnings remained.
**Amends:** only admission-history placement, retry deduplication and first-observation retention clauses in [ADR 013](013-aggregate-delivery-history-and-projection-ownership.md), [ADR 015](015-service-delivery-history-and-projection-ownership.md), [ADR 016](016-aggregate-original-operations-and-external-work.md) and [ADR 024](024-version-chain-sql-archives.md). Their independent resource, execution, selected-history, request-owner and Archive decisions remain governing.

The [Aggregate amendments below](#aggregate-compaction-decision-2026-11-19) replace Aggregate canonical selection and adoption. Service retains canonical selection and reads publication directly from the selected ServiceVersionChain.

## Context

AggregateVersionChain and ServiceVersionChain already retain complete immutable
evaluated commands across local rows and SQL Archives. Keeping every admitted
command permanently in AggregateChain and ServiceChain duplicates the same
history inside another finite database. Deleting those input copies requires a
readable replacement prefix and retry proof that does not depend on local rows.
A materialization checkpoint alone proves resource execution, not publication of
its complete evaluated command to the separate VersionChain.

## Decision

1. Every authored Aggregate and Service registry entry has `releases` and a
   mandatory `canonical` key selecting one registered release. Canonical selection
   participates in the complete SystemSpec hash and may change between accepted
   whole snapshots without changing immutable release facts.
2. AggregateChain and ServiceChain keep admission order, original delivery,
   finalized progress and complete pending work. Each retains local admitted
   commands only above one adopted canonical-history boundary. Adoption uses the
   configured canonical VersionChain's published head. For Aggregate, [ADR
   028](028-archive-backed-aggregate-publication.md) makes this head depend on
   Archive durability. For Service, the stable ServiceChain reads the selected
   ServiceVersionChain's durable local publication head under recovery. Archive
   delivery follows independently. Each pinned ServiceVersionRepo acknowledges
   materialization and publishes its complete evaluations without consulting its
   bundle's canonical selection.
3. Commit subscriber acknowledgement, the adopted release/boundary and deletion
   of covered local input copies in one synchronous source transaction. A failed
   publication or unavailable history read leaves that source prefix available
   for retry. ServiceChain keeps recovery armed until the selected release
   publishes through the finalized position.
4. Retain the previous adopted release at a fixed boundary while a newly selected
   canonical release catches up. Replace it only when publication proof covers
   that entire boundary. Read the adopted prefix through that VersionChain and
   the newer suffix locally; preserve global domain positions and original
   admitted fields and finalization time while removing release-local operations/hash
   from input reads. The selected canonical release supplies the shared historical
   outcome; direct execution returns the originating VersionRepo's own outcome.
5. Recorded System command delivery retains ordered source-position checkpoints
   separately for AggregateChain and ServiceChain producers. Agent Nodes allocate
   a durable dense producer sequence with each frozen command; receiving Chains
   commit that checkpoint with admission and acknowledge old positions before
   fresh grant checks. These domain protocols replace lifetime arbitrary-ID
   lookup. Direct System execution allocates a fresh ID per invocation.
6. Retain an external request's first observation on its existing pending row
   before attempting external-command admission. Admission failure retries the
   retained observation without another provider request. Append and pending-row
   deletion remain atomic; missing pending authority makes late callbacks no-ops.
7. Bound the unadopted input suffix at 64 commands and return retryable capacity
   refusal before admitting new input or advancing producer progress. Browser
   Nodes preserve their journal and retry path; this is not an authority refusal
   and introduces no Node wire change. Aggregate authorization preserves actual
   delegated command-capacity failure without reclassifying authored policy
   refusals as capacity.
8. Preserve synchronous transaction boundaries and existing constructor lifecycle
   gates. No admission-Chain promotion, new Repo routing directory, source-wide
   `blockConcurrencyWhile` handoff or snapshot reset protocol is introduced.

## Alternatives and consequences

Adding independent AggregateChain/ServiceChain Archives would preserve local-input
ownership but duplicate the complete retained history and its storage lifecycle.
With a local ServiceVersionChain suffix, waiting for Archive relocation would
delay source adoption beyond its durable publication boundary. Lifetime command-ID mappings would retain per-command location metadata;
ordered producer checkpoints retain one progress fact per source instead.

Adopted-prefix reads now depend on the saved VersionChain and its Archives being
available. Canonical publication failures retain source input and apply existing
backpressure. Producer checkpoints depend on frozen, ordered producer delivery;
they are acknowledgement protocols, not arbitrary-ID query APIs. A canonical
configuration change must preserve the previously adopted history until replacement
publication covers its boundary. Pure history reads do not require that old release's
authored declaration; pending execution and request work retain their exact-code
requirements.

The fixed schemas require separately authorized empty affected storage before
rollout. This includes SystemRepo's `acceptedSystemSpecs`: its `spec` JSON is
decoded with SystemSpecSchema, and previously retained snapshots lack the now
mandatory owner `canonical` metadata. Whole-SystemSpec acceptance remains atomic;
there is no translation or alternate decoder for those stored snapshots. This implementation supplies no reset, compatibility decoder, migration
translation or deployed cutover. The local behavioral results establish the tested runtime paths, not a deployed
cutover. Plan 277 owns the exact checks, source-check status and proof limits.

The runtime workflow and exact source citations are in
[Canonical History Handoff](../architecture/server/CanonicalHistoryHandoff.md).

## Aggregate compaction decision, 2026-11-19

`AggregateChain` owes each currently listed release the finalized commands
after that release's deployment watermark. It keeps each of those commands
until every listed release owed that position acknowledges replay through it.
The acknowledgement proves publication in the receiving `AggregateVersionChain`.
The Chain records acknowledgement, advances the compacted position, and deletes
covered finalized rows in the same transaction. At least one actual publication
acknowledgement covers every deleted position. A retained acknowledgement can
prove that a VersionChain can serve admitted input and `finalizedAt` after
compaction. An original execution outcome belongs to the addressed release.

If V1 was the only release before V2 and V3 enroll at watermark 10, V1's
acknowledgement covers deletion through 10. After 10, all three must
acknowledge. The existing limit of 64 local commands can pause new admissions
when a listed release stalls.

## Aggregate release predecessors, 2026-11-19

For each named Aggregate, only its first release may omit a predecessor.
Every later release declares exactly one of `branchFrom` or `rebuildFrom`,
naming a registered earlier release of that Aggregate. This rule applies when
the release is declared, including before the first command is admitted.

A branch takes its named predecessor’s evaluations through the saved branch
point. A rebuild evaluates the inputs from its named predecessor’s complete
prefix using its own release. Both declarations identify the source before
any Aggregate instance needs it. Making the predecessor conditional on
compaction would make the same declaration’s validity depend on the history
of each instance.

## Aggregate initialization cutoff, 2026-11-19

When `AggregateChain` first enrolls the new releases of an Aggregate instance,
it saves its current **admitted** position as the deployment watermark for
each new child release. Releases enrolled together get the same position.
The first release begins at zero. Enrollment is durable and retries reuse the
saved watermark, including zero.

The child reads the named predecessor's published history through the saved
watermark. A branch restores those evaluations. A rebuild evaluates the
admitted inputs with its own release. The child may need to wait for the
predecessor to complete the prefix. It publishes its own complete prefix
before receiving commands beyond the watermark from `AggregateChain`.

Suppose `AggregateChain` has admitted 10 and finalized 8 when it enrolls V2
(`branchFrom` V1) and V3 (`rebuildFrom` V2). Both save 10. V2 inherits 1–10
from V1 after V1 publishes them. V3 reads 1–10 from V2 and evaluates them
with V3's code. Each gets commands 11 onward from `AggregateChain`.

Capturing the predecessor's published head at child startup would make the
prefix depend on when the child first opens and how far the predecessor has
published by then. The deployment watermark fixes prefix ownership at
enrollment. Slow predecessor publication delays readiness.
