# Limited actor models, contract adapters, and canonical command mapping

Status: Implemented and verified.

## Summary

1. Rename the aggregate and service server-contract factories to ContractAdapter factories in a naming-only phase.
2. Add fixed field visibility for aggregate and service actors. Browser declarations contain only exposed descriptors; complete runtime models stay in server composition.
3. Run public programs against actor-visible rows and fields. One adapter program translates their checked output into complete canonical mutations.
4. Replace browser finalization objects with nullable private failures. Confirmed occurrences settle optimism; local staging results and canonical server results retain their existing ownership.

## Phase 1: Rename contract factories to ContractAdapter

This phase changes factory names and module paths only. Execution behavior remains unchanged through its verification checkpoint.

| Current                       | Replacement                    |
| ----------------------------- | ------------------------------ |
| `makeAggregateServerContract` | `makeAggregateContractAdapter` |
| `makeServiceServerContract`   | `makeServiceContractAdapter`   |

### Implementation

1. Rename both factory functions and their source files. Remove old import paths and exports outright, with no compatibility aliases.
2. Update SDK exports, Shopping and Tic-tac-toe callers, and existing type/runtime verification imports.
3. Update active documentation, SDK reference tables, glossary references, and module links. Preserve historical archive wording while repairing links to moved files.
4. Preserve unrelated workspace changes.

### Verification

1. Build core and SDK through their existing Nx `lib` targets.
2. Run Shopping and Tic-tac-toe's existing Nx `ts` targets and core's `lint` target.
3. Run the existing contract verifier (`scripts/verify-plan140.mjs`, removed 2026-10-17) to confirm construction, client execution requirements, operation composition, and rejection behavior still pass.
4. Confirm old factory names and paths have no remaining active imports, exports, calls, or API references. Historical wording and this phase's rename comparison remain migration records.

### Scope and defaults

1. Rename only the factories and module paths. Existing `ServerContract` types, classes, branding, and serialized definitions retain their names throughout this plan.
2. Keep factory arguments, inferred return types, server-only restrictions, result-only `.execution`, and automatic client-operation concatenation unchanged in this phase.
3. Limited models, operation translation, and browser finalization changes belong to phase 2, outside this naming change.
4. Add no tests, fixtures, runners, storage migrations, or package-version changes. The rename alone requires no storage change.

## Phase 2: Limited models and canonical operation translation

### Interfaces and behavior

1. Add an inferred, browser-safe factory:

   ```ts
   makeLimitedModelVersion(modelIdentity, {
     version,
     attributes: publicAttributes,
     indexes,
   });
   ```

   Share public descriptors with the complete server model. Retain framework resource fields and canonical model identity/version. Validate descriptor agreement during server composition; browser declarations require no complete runtime model import.

2. Require actors to declare exposed `models` separately from their canonical query `db` and row `selections`. Validate session locks against exposed schemas. A model without a selection exposes no existing rows. Preserve exact public contract/model binding.
3. Project selected rows before computing deltas; snapshots use the same projection. Actor versions govern visibility changes, without a separate projection version. Limit this capability to whole top-level attributes with unchanged codecs. Retained public relations require visible destination schemas and reference closure; indexes may reference only exposed columns.
4. Change `contract.execution` to supply checked `{ operations, result }`. The adapter's existing `program` emits its entire canonical batch through declared recording operations. Remove automatic concatenation of public operations. Validate public output first, canonical output afterward, and apply only the canonical batch in the owning transaction. Explicitly migrate existing adapters that currently rely on automatic preservation of client operations.
5. Public server guards/programs read the current actor-visible graph. Use CTE-backed queries over the canonical transaction, preserving compiled parameter encoders and relational result mapping. Authoritative policies and the adapter program retain canonical reads. Do not wait for AAVC catch-up or introduce another retained replica.
6. Replace browser `finalization` with `failure: PublicFailure | null` throughout delivery, replay, Node storage, and session history. Preserve exact recipient privacy. Confirmed occurrence IDs settle optimism, including empty deltas; retain local staging results and canonical server finalization.

### Implementation

1. Implement limited schemas and actor registration validation, including public reference bindings and visible-column indexes.
2. Update execution types, evaluation, declaration validation, and adapter programs to explicitly produce canonical output.
3. Update both actor projection families, admission locks, browser/native reconciliation, and affected application consumers. Agent and standalone visibility policies remain as declared; shared browser consumers adopt the failure envelope.
4. Reconcile implemented terminology in the glossary and affected documentation. Create an ADR only if the implemented decision is hard to reverse, surprising without context, and the result of a real trade-off.
5. Archive this plan after implementation and required verification are complete.

## Planned file hierarchy

Legend: `+` create; `~` modify, including renames. These are the primary interface files; existing producers, consumers, declarations, verification imports, and documentation migrate in place as described above.

```text
zerospin/
├── packages/core/src/
│   ├── models/make/
│   │   └── + makeLimitedModelVersion.ts
│   └── contracts/
│       ├── ~ types.ts
│       ├── ~ evaluateContract.ts
│       ├── ~ BrowserCommandSchema.ts
│       └── make/
│           ├── ~ makeAggregateContractAdapter.ts (rename factory module)
│           ├── ~ makeServiceContractAdapter.ts (rename factory module)
│           └── + makeActorContractReadDb.ts
├── packages/sdk/src/
│   ├── ~ index.ts
│   └── browser/
│       └── ~ index.ts
├── scripts/
│   └── ~ verify-plan140.mjs
└── wiki/plans/
    └── + 146-plan-limited-actor-models.md
```

## Phase 2 verification and cutover

1. Verify hidden attributes and descriptors are absent from ordinary browser schemas, snapshots, and upserts; reject mismatched session schemas.
2. Verify selected rows, nested relations, ordering, and pagination agree between local public reads and authoritative public reads.
3. Verify limited creates receive private canonical attributes, visible updates preserve hidden attributes, and rejection applies no mutations.
4. Verify empty deltas, failures, duplicate delivery, reconnect, and pending replay settle correctly without finalization objects.
5. Run scoped existing Nx type, lint, build, and Workerd checks. Reuse existing verification seams and update existing assertions for the phase 2 behavior; create no test files, fixtures, runners, or configuration without explicit authorization.
6. Apply the pre-release hard cutover: no compatibility paths or storage translations. Changed fixed schemas require empty affected storage; do not automatically delete or reset storage.
7. Preserve unrelated WIP and add no package-version changes as part of this plan.

## Implementation outcome

1. Renamed both ContractAdapter factories and modules with no compatibility exports. Existing ServerContract types, classes and branding remain unchanged.
2. Added inferred browser-safe limited model declarations and required exposed actor `models`, separate from canonical query databases and row selections. Composition validates complete framework fields, unchanged top-level descriptors/codecs, visible indexes, public reference graphs and exact contract bindings. Actor specs retain exposed schema facts. Session locks validate those schemas, reference graph closure and exact public contract read/mutation model membership; forged subsets return the existing typed refusal envelopes.
3. Actor projection uses exposed rows before deltas and snapshots. Ordinary public server programs read current selected rows and visible columns through CTE-backed relational queries in the canonical transaction. Compiled parameter encoders, mapping, ordering and pagination remain intact. Authoritative policies and adapter programs retain canonical reads. Agent and standalone visibility policies remain unchanged.
4. Public execution supplies checked `{ operations, result }`. Adapters explicitly record their entire canonical batch and own its permission codec; public output is never appended automatically. Existing application adapters migrate in place. Only checked canonical output applies inside the existing owning transaction/savepoint.
5. Browser delivery, replay, Node storage and session history use nullable private failures. Confirmed occurrence IDs settle optimism, including empty deltas. Exact node/session/full-claims privacy remains intact. Local staging results and canonical server finalization retain their ownership.
6. Node fixed schema version is 14; native session schema version is 3. Changed affected storage must be empty. No user storage was reset or translated, no package versions changed, and no new test files, fixtures, runners or configuration were created.

## Verification outcome

1. Phase 1 passed core/SDK builds, Shopping/Tic-tac-toe type checks, core lint and all seven original contract-verifier groups. Retired factory names and module paths have no remaining active imports, exports, calls or API references.
2. Final scoped Nx graph passed `lib`, `ts`, `lint`, `test-workerd`, `test-workerd-ts` and `typecheck` for `@zerospin/core`, `@zerospin/browser`, `system-worker`, `@zerospin/sdk`, `@zerospin/native`, `@zerospin/studio`, `shopping`, `tic-tac-toe` and `explorer`, including required dependencies. Workerd passed five files and nineteen tests. Existing Explorer lint reports six warnings in unchanged UI files. Nx Cloud reports an access warning; all local tasks completed successfully.
3. Existing `scripts/verify-plan140.mjs` passed eight groups. The limited-model scenario verifies hidden descriptor/resource absence, aggregate lock mismatch refusal, forged aggregate/service lock subset refusals, public reference closure and hidden index refusal, local/server nested relational reads with ordering/pagination, compiled JSON parameter encoding, CTE name collision avoidance, transformed identity through actual aggregate/service evaluation, private canonical creates and hidden-field-preserving updates. Existing rejection/savepoint checks verify no partial writes.
4. Existing `scripts/verify-session-identity.mjs` passed all three groups: empty confirmations, private failure disclosure, exact full-claims privacy, duplicate delivery, pending replay settlement, reconnect/reopen recovery, standalone execution and prior-schema refusal.
5. The existing compile-only contract inference acceptance file passed with limited attribute/name/version inference, checked execution output and canonical-only operation permissions. Final core/system-worker builds and lint pass without source warnings after the admission correction. Scoped formatting, `git diff --check` and hard-cutover searches passed.

## Remaining work

None.
