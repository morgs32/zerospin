# SystemRepo.acceptedDefinitions

**Original review:** 2026-10-16, with independent column-design and catalogue-lifecycle reviewers. That review examined the pre-Plan 220 `key`/`definition` representation and recommended storing `spec` directly. Its five-identity Agent model and Service query-registry inventory are historical; subsequent Agent and Plan 255 hard cutovers replaced those declarations.

**Current reconciliation — 2026-10-23:** the approved key/spec representation is implemented. The current catalogue has six logical identity kinds, owner-release-bound Agent definitions without an independent Agent version, and no Service query registry. This document reconciles the original finding with current source; it does not reopen the table review.

**Verdict:** retain the permanent immutable catalogue, its unique canonical key, complete projected specs and independent cross-release Actor-version locks. Remove the duplicated persisted identity. [ADR 007](../../adrs/007-canonical-results-and-selected-chain-ownership.md) remains governing for this catalogue.

**Verification — 2026-10-23:** [Plan 220](../../archive/plans/220-plan-accepted-definition-key-spec-storage.md) records completed scoped verification: four catalogue cases and the existing alarm case pass, followed by all 92 System Worker tests with typing and required builds. The generated schema now rejects an empty object and accepts every complete fixture spec; owning-reader/row-codec comparisons separately prove lossless storage. Ticket admission under Plan 221 and broader physical registration under Plan 222 remain separate.

## Physical owner and current representation

One SystemRepo belongs to an exact `systemId`. Its accepted definitions are permanent comparison facts, rather than executable declarations, current configuration, model rows or pending delivery. The configured System remains executable authority. Retaining definitions omitted by later deployments prevents a later bundle from redefining an already accepted identity.

The table has exactly two required/non-null columns and no defaults: unique text `key` and typed JSON `spec`. It has no explicit primary key, foreign key, secondary index declaration, timestamp, revision, hash or status. No `definition` envelope or separately retained identity remains.

- [`systemRepoName.ts:6-12`](../../../packages/system-worker/src/SystemRepo/systemRepoName.ts#L6-L12) — binds the physical owner to `systemId`.
- [`systemRepoDbConfig.ts:10-18`](../../../packages/system-worker/src/SystemRepo/systemRepoDbConfig.ts#L10-L18) — declares the complete two-column catalogue.

## Current identity scopes

The canonical JSON tuple encodes the exact family, owner and applicable version/name positions. Opaque names are JSON string values, with no delimiter parsing. The containing SystemRepo supplies System ownership.

| Logical kind      | Canonical key tuple                                              | Immutable scope                                                                  |
| ----------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Aggregate release | `["aggregateRelease", aggregateName, aggregateVersion]`          | The named Aggregate release's complete portable definition.                      |
| Service release   | `["serviceRelease", serviceName, serviceVersion]`                | The named Service release, distinct from an identically named Aggregate release. |
| Aggregate Actor   | `["aggregateActor", aggregateName, actorName, actorVersion]`     | The Actor declaration across releases of its named Aggregate.                    |
| Service Actor     | `["serviceActor", serviceName, actorName, actorVersion]`         | The Actor declaration across releases of its named Service.                      |
| Aggregate Agent   | `["aggregateAgent", aggregateName, aggregateVersion, agentName]` | The Agent's projected meaning under one exact Aggregate release.                 |
| Service Agent     | `["serviceAgent", serviceName, serviceVersion, agentName]`       | The Agent's projected meaning under one exact Service release.                   |

Actor keys deliberately omit the enclosing release version. Agent keys retain the owner release version; Agent specs have no independent `version` or `agentVersion`. Changing the projected Agent meaning requires advancing its owner release. These accepted Agent identities are distinct from unversioned AggregateAgentNodeRepo and ServiceAgentNodeRepo identities.

- [`AcceptedDefinitionSchema.ts:5-47`](../../../packages/system-worker/src/SystemRepo/acceptedDefinitions/AcceptedDefinitionSchema.ts#L5-L47) — declares all six logical identity kinds.
- [`AcceptedDefinitionSchema.ts:51-138`](../../../packages/system-worker/src/SystemRepo/acceptedDefinitions/AcceptedDefinitionSchema.ts#L51-L138) — encodes each exact canonical tuple.
- [`projectAcceptedDefinitionEntries.ts:11-79`](../../../packages/system-worker/src/SystemRepo/acceptedDefinitions/projectAcceptedDefinitionEntries.ts#L11-L79) — pairs release, Actor and owner-bound Agent specs with their identities.

## Complete projected comparison facts

The spec retains the complete portable declaration defined by current SystemSpecSchema. Release specs retain name/version, models, contracts and complete Actor records. Separate Actor entries additionally retain the complete Actor definition independently of enclosing release version. Agent specs retain name, owner name/version, session, contracts, behaviors, selections and models. The behavior and selection definitions are part of the Agent's accepted meaning.

Service definitions contain no named query registry. The Plan 255 hard cutover rejects retained `queries`, including `{}`; the original review's recommendation to retain those fields no longer applies. Full current nested declarations remain comparison facts, including model/index descriptors, contract payload/result/failure and operation declarations, Actor authentication/identity/exposure, selection definitions, and Agent behavior definitions. Executable callbacks and their function bodies are not stored.

The spec-only codec strictly checks the full current union without transforming the supplied value. The resumed verification exposed an unconstrained exported `{}` schema when canonical JSON conversion replaced its `Unknown` root and lost refinement metadata. The object-record root now preserves every key and the same strict refinement/full-union representation through that conversion; scoped runtime verification remains pending. It has five outer union members; its Agent member is itself the Aggregate/Service union. That syntax does not reduce the six logical identities. Structurally identical Aggregate and Service release specs may have identical bytes: their canonical keys supply family ownership, rather than a second persisted identity check.

- [`SystemSpecSchema.ts:60-98`](../../../packages/core/src/system/SystemSpecSchema.ts#L60-L98) — declares complete common Agent facts and each exact owner pin, without an independent Agent version.
- [`SystemSpecSchema.ts:99-164`](../../../packages/core/src/system/SystemSpecSchema.ts#L99-L164) — retains full release/Actor definitions and omits a Service query registry.
- [`AcceptedDefinitionSchema.ts:140-209`](../../../packages/system-worker/src/SystemRepo/acceptedDefinitions/AcceptedDefinitionSchema.ts#L140-L209) — correlates each logical identity with its spec name and applicable owner/declaration version.
- [`AcceptedDefinitionSchema.ts:212-242`](../../../packages/system-worker/src/SystemRepo/acceptedDefinitions/AcceptedDefinitionSchema.ts#L212-L242) — strictly checks the complete spec union while preserving the original input and its full fixed-schema representation.

## Acceptance, reads and registration

`acceptSystemSpec` strictly decodes the candidate, projects logical entries and calls `acceptDefinitionEntriesTx`. Each entry is strictly decoded before its canonical key and stored spec are projected. One synchronous transaction compares every retained complete spec or inserts an unseen identity. Equal repeats do not rewrite. A conflict or malformed entry rolls back new insertions in that supplied batch.

`readAcceptedDefinition` first strictly validates its requested identity and reads only the canonical exact key. Only an absent key returns undefined. A retained row is decoded and reconstructed as `{ identity, spec }` using that requested identity, then checked for the matching branch, name and applicable version. Invalid identity, JSON or retained spec fails with `system-spec-invalid`; it cannot become permission to overwrite the row.

The removed `definition.identity` had provided an additional key-versus-identity consistency comparison. Removing it deliberately makes the canonical key the sole durable ownership association. Exact-key lookup and strict reconstructed validation remain required. They do not detect another family or owner independently when the same spec bytes legitimately fit both contexts.

`assertAcceptedSpec` compares complete JSON-compatible specs using JsonPatch. Mismatches retain kind-specific errors and path-sensitive changes in the message and `extra.changes`. A hash alone would lose that evidence. Complete embedded Actor definitions freeze a release's composition; separate Actor entries prevent a reused Actor version from changing in another release. Both responsibilities remain.

Registration strictly validates the executing spec and requires every supplied entry to be already accepted and equal. It never inserts accepted definitions. Those immutable catalogue reads precede the synchronous physical registration transaction. Source ordering is not proof of Plan 222's broader registration and activation behavior.

- [`acceptSystemSpec.ts:15-26`](../../../packages/system-worker/src/SystemRepo/acceptSystemSpec/acceptSystemSpec.ts#L15-L26) — strictly decodes the candidate, projects entries and invokes acceptance.
- [`acceptDefinitionEntriesTx.ts:20-62`](../../../packages/system-worker/src/SystemRepo/acceptedDefinitions/acceptDefinitionEntriesTx.ts#L20-L62) — owns batch validation, complete retained comparisons and key/spec insertions in one synchronous transaction.
- [`readAcceptedDefinition.ts:30-61`](../../../packages/system-worker/src/SystemRepo/acceptedDefinitions/readAcceptedDefinition.ts#L30-L61) — validates exact requested identity, distinguishes absence and strictly reconstructs retained definitions.
- [`assertAcceptedSpec.ts:18-41`](../../../packages/system-worker/src/SystemRepo/assertAcceptedSpec/assertAcceptedSpec.ts#L18-L41) — compares the complete JSON values and retains path-sensitive mismatch diagnostics.
- [`projectAcceptedDefinitionEntries.ts:11-55`](../../../packages/system-worker/src/SystemRepo/acceptedDefinitions/projectAcceptedDefinitionEntries.ts#L11-L55) — emits both complete releases and independent Actor entries.
- [`requireAcceptedDefinitionEntries.ts:28-44`](../../../packages/system-worker/src/SystemRepo/acceptedDefinitions/requireAcceptedDefinitionEntries.ts#L28-L44) — refuses absence and compares retained specs without inserting.
- [`registerRepo.ts:35-78`](../../../packages/system-worker/src/SystemRepo/registerRepo/registerRepo.ts#L35-L78) — checks catalogue agreement before writing physical Repo metadata and AggregateChain identity.

## Retention, hard cutover and proof limits

**Deletion condition: none in the supported catalogue lifecycle.** Equal acceptance, delivery acknowledgement, deployment omission, a failed promotion or absence of active Repos does not release an accepted definition. Removing one would let a changed declaration reclaim its identity. There is no supported update, delete, expiry or automatic retirement path.

The fixed-schema key/spec cutover requires empty affected SystemRepo storage, with no alias, fallback decoder, migration or automatic reset. [Plan 255](../../archive/plans/255-plan-typed-system-service-reads.md) separately records the approved Service query-registry cutover and its local reset; it does not add a normal catalogue deletion lifecycle or authorize another reset.

The original source review established the representation recommendation and its retention rationale. Plan 220 now verifies all six identity scopes, full-spec preservation/refusal, exact reads, batch rollback, no-write equal acceptance and registration, omission/reconstruction retention and both Actor families' cross-release locks. The cases use the actual exported SystemRepo through loopback RPC and stock Workerd SQL inspection over disposable SQLite. They do not establish deployed activation, credential authentication, ticket consumption, provider behavior or UI behavior. The former historical list of deferred child plans is not a current backlog; [Plan 151](../../plans/151-plan-storage-table-review.md) owns that status.

**Next table:** SystemRepo.sessionWebSocketTickets retains its separate review and verification responsibility; no result for that table is implied here.
