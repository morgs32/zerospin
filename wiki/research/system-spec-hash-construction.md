# Complete SystemSpec content identity

Implementation follow-up, 2026-10-25. Plan 266 implements the findings below in the Zerospin working tree; authorized framework verification is complete. This replaces the earlier research proposal. Package publication and consumer reconciliation are separate work.

## Implemented boundary

`makeSystem` validates composition, then finalizes every participating contract node reachable through runtime `previous` and `next`. Later upgrades refuse before constructing/linking a child. The same finalized declarations can be reused by another System, but cannot be extended after any System has composed them. Finalization remains beside the existing private lineage maps; no second System-provenance registry or per-System runtime resolver was added.

- [System composition](../../packages/core/src/system/make/makeSystem/makeSystem.ts)
- [Private lineage and upgrade construction](../../packages/core/src/contracts/make/constructContractVersion.ts)

Each contract version owns complete metadata: singular payload/failure/result facts, contract claims, read models, operations, and optional external response/timeout facts. Runtime links and executable functions are absent. SystemSpec compilation starts from all registered owner contracts and includes every reachable version's own facts, including omitted source/intermediate versions and reachable descendants. These live under owner-scoped `contractVersions`; compiled release/Actor/Agent maps bind exact version numbers. Authors do not maintain another registry.

- [Own contract schema](../../packages/core/src/contracts/ContractSpecSchema.ts)
- [Complete compiler](../../packages/core/src/system/make/makeSystemSpec.ts)
- [Binding/reference validation](../../packages/core/src/system/SystemSpecSchema.ts)

The synchronous factory returns one detached frozen SystemSpec with flat `.hash`. Shared hashing schema-encodes the complete body, enforces JSON values, sorts object keys recursively with locale-independent ordering, preserves array order, and hashes UTF-8 bytes with SHA-256. The hash field is excluded from its own input. A hash identifies portable metadata; it does not fingerprint codec transformations, guards, programs, adapter bodies or lineage topology.

- [Canonical hash](../../packages/core/src/system/hashSystemSpec.ts)

## Acceptance and execution

SystemRepo validates the supplied candidate and recomputes its hash. That candidate may originate from a different Cloudflare Worker version than SystemRepo currently executes. A single acceptance transaction compares immutable contract/release/Actor/Agent facts against all retained whole snapshots, then inserts one `acceptedSystemSpecs` row containing `hash` and complete `spec`. Equal acceptance is idempotent; conflicts reject the whole snapshot. Omissions never erase earlier snapshots. No persisted component index, full identity envelope, individual acceptance operation or replay-comparison RPC remains.

- [Candidate validation](../../packages/system-worker/src/SystemRepo/acceptSystemSpec/acceptSystemSpec.ts)
- [Atomic snapshot acceptance](../../packages/system-worker/src/SystemRepo/acceptSystemSpec/acceptSystemSpecTx.ts)
- [Snapshot storage](../../packages/system-worker/src/SystemRepo/systemRepoDbConfig.ts)

Child startup derives its actual configured SystemSpec hash and passes it through existing registration before local SQL. Membership is checked before physical registration/Aggregate membership writes. SystemRepo retains its bootstrap exemption. Session-ticket creation checks SystemRepo's own executing snapshot locally, preserving current admission/claims/session-lock and one-use-ticket checks. Accepted membership is a trusted-runtime prerequisite, not a token proving an arbitrary caller's claimed hash belongs to its code.

- [Startup](../../packages/system-worker/src/makeMigratableDORepo/makeMigratableDORepo.ts)
- [Registration](../../packages/system-worker/src/SystemRepo/registerRepo/registerRepo.ts)
- [Hash membership](../../packages/system-worker/src/SystemRepo/requireAcceptedSystemSpec.ts)
- [Ticket issuance](../../packages/system-worker/src/SystemRepo/sessionWebSocketTickets/createSessionWebSocketTicket.ts)

New commands must match the addressed release's exact contract version. Codec coverage never grants fresh admission. Replay keeps historical decoding/adaptation and exact-model operation validation without an acceptance comparison per command. Ordinary historical replay can use lineage after its original release is omitted; Actor/external replay still requires its existing executable authority/declarations. Retained output restoration keeps bypassing adapters/programs.

- [Aggregate admission](../../packages/system-worker/src/AggregateChain/admitAggregateCommands/validateNewAggregateCommand.ts)
- [Service admission](../../packages/system-worker/src/checkAdmission.ts)
- [Payload adaptation](../../packages/core/src/contracts/decodeAndAdaptPayload/adaptPayload/adaptPayload.ts)
- [Retained operations](../../packages/core/src/contracts/prepareReplayAppliedOperation.ts)

## Verification scope

The eight-package framework build/type/lint graph and affected existing backend suites have passed; the final lifecycle/session rerun passed all 16 tests without unhandled errors. Existing Node/workerd files cover schema closure, hashing/finalization, atomic acceptance/omission, startup/session refusal, exact fresh versions and historical adaptation. Actual omitted-history materialization is exercised at the existing replay-domain/database seam with an explicit System dependency; acceptance/startup binding are separate lifecycle proofs. This is not an end-to-end configured Worker rollout claim. Full results are recorded in [completed Plan 266](../archive/plans/266-plan-independent-contract-version-specs.md).

No test files, fixture files, runners, compatibility paths, publication or storage resets were added. Cloud's old-layout page and its verification were explicitly deferred to dependency reconciliation. The fixed SystemRepo schema requires a separately authorized operational cutover; this implementation does not reset storage.
