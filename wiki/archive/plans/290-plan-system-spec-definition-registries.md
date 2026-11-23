# Plan 290 — SystemSpec definition registries

Status: Complete and archived on 2026-11-03. Framework implementation and verification, checked local `40.0.0` publication and exact Mentor Mailbox adoption are complete; the duplication fix merged in PR #122. The maintainer approved closing this framework plan and assigning all deferred release coordination, temporary seed setup and connected Hub verification solely to [Mentor Mailbox Plan 028](../../../../mentormailbox/wiki/plans/028-plan-hub-student-workspaces-and-drafts.md). Those checks remain unverified and explicitly deferred until a user-cut release and resumed authorization. Archival does not resume or waive them.

## Problem and research

1. Mentor Mailbox's complete SystemSpec is 4,296,541 bytes, beyond the installed runtime's measured 4 MiB SQLite value limit. Its previous specification was 4,022,118 bytes. Dropping historical releases or changing canonical selections is not permitted.
2. The compiler repeats canonical model definitions in contract reads, mutation operations and owner releases, and repeats unchanged actors across owner releases. Actor projections may intentionally expose a subset and must retain their exact shape.
3. The [library research](../../research/system-spec-deduplication-libraries.md) found no safe drop-in: structurally deduplicating candidates corrupted valid JSON keys or numbers, while identity-based codecs do not remove detached equal copies. Use explicit domain registries instead of a generic compression layer.

## Agreed implementation

1. Each aggregate/service owner in SystemSpec gains `modelVersions`, `actorVersions` and `agentVersions` registries keyed by declaration name and exact version. Store each complete definition once in its owner context. Keep `contractVersions` as the existing owner-local registry.
2. Owner releases bind models, actors and agents by name/version. Contract read models and Agent models bind canonical model versions; mutation operation metadata references `{ modelName, version }`. Actor exposed-model projections remain complete and inline inside their single Actor version definition.
3. Compile definitions from all registered releases and reachable contract lineage, including mutation and Agent models. Reject conflicting identities and missing or mismatched references. Retain every existing registered release and canonical selection unchanged. Do not change native declaration authoring, operation execution, browser lock formats or permission rules.
4. Preserve deterministic hashing over the complete normalized portable facts. SystemRepo's synchronous acceptance transaction compares model, contract, actor, agent and release facts by owner-local immutable identities; dereference the normalized bindings where required. Content/hash validation and equal-hash acceptance without writes remain authoritative.
5. Update in-scope SystemDiagrams and Studio consumers, metadata examples, existing tests, developer docs and runtime architecture. Remove superseded expanded DTO paths rather than adding compatibility aliases.
6. This changes the portable SystemSpec format and hash. Follow the pre-release hard-cutover policy: use fresh isolated development storage and preserve older stores unchanged. Add no legacy decoder, translation migration, storage reset or compatibility-only test. No production deployment or public-registry publication is authorized.
7. Publish the checked source revision as a new fixed-group local release beyond 39.0.0 (planned major 40.0.0 because the metadata format changes), through the existing local registry. Keep source workspace protocols and the consumer's deliberate Studio link. Install exact coherent fixed-group pins in Mentor Mailbox, refresh its managed SDK rules and verify its frozen lockfile.

## Verification and completion

1. Extend the existing SystemSpec metadata and SystemRepo lifecycle tests for registry references, one definition per immutable identity, exact Actor projections, missing/conflicting references, deterministic hashes, changed immutable facts and retained complete snapshots. Demonstrate a large repeated native definition set stores below the SQLite limit and remains readable. Do not create test files or runners or verify Explorer.
2. Run scoped Nx library/type/lint tasks for the changed projects and their required dependency closure, and focused existing Node/workerd test targets. Once passing, review the concrete release metadata, commit only the owned changes from the initially clean main checkout, publish locally and adopt in Mentor Mailbox.
3. Recompute the actual Mentor SystemSpec size, start its dedicated fresh backend/API, execute its temporary seed via the Zerospin seed CLI and complete Plan 028's connected Hub verification. Preserve all existing data and unrelated avatar services/work.
4. Reconcile implementation terminology with the existing glossary and architecture. [ADR 026](../../adrs/026-owner-local-system-spec-definition-registries.md) records the owner-local normalized format, inline Actor projection rule and strict cutover tradeoff. The original completion boundary included connected verification; on 2026-11-03, the maintainer transferred that remaining responsibility to Mentor Mailbox Plan 028 and approved archival of this completed framework plan.

### Documentation status

- [x] Update SystemApi and AuthoredSystem with owner-local registries, exact version bindings, immutable model comparison and source-verified citations.
- [x] Update glossary, public handbook/reference/diagram guidance, Repo lifecycle pattern and declaration-evolution guidance.
- [x] Record ADR 026 for semantic deduplication and the new-format-only cutover.
- [x] Complete coordinated framework verification and review: 38 focused Node/workerd tests pass, including real RPC retention/readback, immutable-fact refusals and a repeated native declaration set beyond the prior SQLite value limit. Scoped library, type and lint checks pass; final packaging artifacts are rebuilt from the checked revision.
- [x] Complete checked local release publication, exact consumer adoption and frozen-lock verification; managed SDK rule refreshed and check passed.
- [x] Close framework tracking and hand deferred Mentor Mailbox connected verification to Plan 028 on 2026-11-03. This records ownership transfer, not passing connected checks.

## Planned hierarchy

`+` create; `~` modify. Supporting schema/type modules are included only where their current owning interface changes.

```text
zerospin/
├─ + wiki/plans/290-plan-system-spec-definition-registries.md
├─ + wiki/research/system-spec-deduplication-libraries.md
├─ ~ wiki/{glossary.md,architecture/**}
├─ ~ fragment/content/{handbook,reference,guides}/**
├─ packages/core/src/
│  ├─ ~ system/{SystemSpecSchema.ts,make/makeSystemSpec.ts}
│  ├─ ~ declaration/{makeContractSpec.ts,makeReleaseSpecs.ts,makeActorSpecs.ts,ReleaseSpecSchemas.ts}
│  └─ ~ contracts/{ContractSpecSchema.ts,ContractOperationsSchema.ts,operationSchema.ts,types.ts}
├─ ~ packages/system-worker/src/SystemRepo/acceptSystemSpec/acceptSystemSpecTx.ts
├─ ~ packages/system-worker/tests/{repo-names/repo-names.spec.ts,repo-lifecycle/repo-lifecycle.workerd.spec.ts}
├─ ~ packages/system-diagrams/src/**
├─ ~ packages/studio/stories/declarationStoryData.ts
└─ ~ fixed-group package versions, release notes and lockfile
```

## Implementation and verification results

1. Commit `78a23270d8` on `main` contains the normalized definition registries.
   Scoped changed-project library, type and lint checks passed, as did 38 focused
   Node/workerd tests. These include real RPC retention/readback, immutable-fact
   refusals and repeated native declarations exceeding the former SQLite limit.
2. All 20 fixed-group packages were published to the existing local registry as
   `40.0.0` from the clean `/private/tmp/zerospin-plan290-publish` checkout of that
   revision. Mentor Mailbox adopted coherent exact pins, passed a frozen-lockfile
   install and refreshed/checked its managed SDK rule. The deliberate Studio link
   remains. No public-registry publication or production deployment occurred.
3. Mentor Mailbox's actual normalized SystemSpec is 2,000,938 bytes, compared with
   4,296,541 expanded bytes: 53.4% smaller. Its hash is
   `2c50871269b7c6a421c4178049909e81e81cadc2121c752f594e6ef899042478`.
   Users and Organization each retain releases 1 through 5 and canonical 5.
   `/private/tmp/plan028-system-spec-normalized.json` retains the serialized proof.
   The dedicated fresh backend is ready and accepted this complete snapshot.
4. On the adopted packages, Mentor Mailbox passed its backend suite (46 tests),
   API suite (15), routing/availability checks (9) and draft/recovery checks (10).
   Backend/API and App/Admin/Hub/Ops typechecks, Hub production build and API dry-run
   build passed. Connected authority and browser behavior remain separate proof.
5. The temporary seed exited because SDK `makeId` lacked its `CuidFactory` service;
   its temporary layer setup and rerun remain deferred with connected verification. Background
   external-contract errors in older Users releases do not block canonical 5:
   retained canonical history reached index 10 with profiles and organizations.
   Those errors are not this seed failure or a further adoption prerequisite.
   The prior dedicated API was gracefully stopped before the normalized fresh API
   started. Existing stores and unrelated avatar services remain untouched.

6. Live Hub development sign-in as `mentor1` succeeded and showed `/no-memberships`
   before fixture invitations. This establishes sign-in only. The user requested
   a PR for the owned duplication fix and explicitly deferred further release and
   connected work until they merge it and cut a release.

## Completion and handoff — 2026-11-03

1. The framework work is complete. PR #122 is merged; recorded framework verification, local publication and exact consumer adoption remain the evidence above. No additional runtime checks were run for this archival.
2. The maintainer approved closing this plan and transferring the remaining release coordination, temporary seed setup and connected Hub verification solely to [Mentor Mailbox Plan 028](../../../../mentormailbox/wiki/plans/028-plan-hub-student-workspaces-and-drafts.md). That plan already owns the connected acceptance checks. Its older instruction to archive both plans is superseded by this handoff.
3. Plan 028 must wait for the user-cut release and explicit resumption, establish the adopted release and isolated service state, repair the temporary seed's SDK `CuidFactory` layer setup, and complete student/date navigation, chat access changes, sending and attachment restoration checks. Existing checks and mentor1 sign-in do not establish those results. Do not continue independently.
4. Preserve prior stores, unrelated avatar services and separate handbook work. No storage reset, production deployment or further package publication is authorized by this handoff.

## Remaining work

1. None in this framework plan. The deferred consumer work remains open in Mentor Mailbox Plan 028; it is neither cancelled nor verified by archival.
