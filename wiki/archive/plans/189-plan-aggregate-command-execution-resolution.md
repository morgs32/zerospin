# Aggregate command execution resolution

**Date:** 2026-10-15

**Status:** Completed and verified jointly with Plan 190 on 2026-10-15.

**Related:** [Plan 190 — aggregate delivery, history and projection ownership](190-plan-aggregate-delivery-history-and-projection-ownership.md), [Plan 151 — storage table review](../../plans/151-plan-storage-table-review.md), [executedCommands review](../../reviews/storage-tables/aggregate-version-repo-executed-commands.md).

## Problem and agreed result

`resolveAggregateExecution` mixes selection of this Repo's executable contract with lookup of the command's original aggregate release, historical actor/contract resolution, claims validation and payload decoding. Its `implementation`, `contract` and `executionRelease` names obscure those different facts. The original aggregate release becomes mandatory even when the exact historical contract and actor definitions remain available independently.

Make the parent read as the short sequence of domain steps shown in [AGENTS.md](../../../AGENTS.md#ideal-method-shape). Resolve each definition by its own identity. The aggregate release this Repo owns chooses the program and owned models; the incoming contract identity/version determines the input schema.

The maintainer explicitly approved these names and this simpler design:

| Name                        | Settled meaning                                                                                                                                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `executionAggregateRelease` | The exact aggregate release supplied by this VersionRepo. Replace `executionRelease` in the affected Aggregate execution pipeline.                                                                                                              |
| `executionContract`         | The canonical contract entry selected from that release: the entry whose `evaluate` runs and whose result codec encodes the result. Replace the resolved variable/property `implementation`.                                                    |
| `resolveExecutionContract`  | Select the named contract in `executionAggregateRelease`, enforcing actor exposure for ordinary actor commands. It does not choose the original release or the latest release.                                                                  |
| `sourceContract`            | The exact public contract version describing the incoming payload and, for a continuation, its recorded external response. Its identity is owner-scoped contract name plus `command.contractVersion`.                                           |
| `decodeAndAdaptPayload`     | Decode the incoming payload with its declared contract version and apply only the declared adaptation path to the execution contract's public payload version. This is the existing decoding/adaptation responsibility under its explicit name. |

These decisions are settled; do not request approval for them again during implementation.

## Intended method shape

The parent remains a cohesive preparation procedure. In explanatory pseudocode:

```ts
const executionContract = resolveExecutionContract(
  executionAggregateRelease,
  command,
);
const sourceContract = resolveContractVersion(
  executionContract,
  command.contractVersion,
);
const actor = resolveOriginActor(command.origin);
const claims = decodeAndValidateActorClaims(command, actor);
const decodedPayload = decodeAndAdaptPayload(
  command,
  sourceContract,
  executionContract,
);

return { executionContract, actor, claims, decodedPayload };
```

Supply the established aggregate owner context explicitly wherever historical actor or external-contract lookup requires it; actor/contract names and version strings are not globally unique across owners. The pseudocode omits that plumbing and Effect notation. It does not authorize a global declaration search or an implicit latest-version lookup.

Keep each procedure responsible for real work. Do not introduce forwarding wrappers or preserve the old long procedure behind renamed helpers. Small conditional branches can remain inline. The caller prepares the invocation, runs policies/guards and evaluates the selected entry in the existing order.

## Resolution rules

1. **Execution selection:** select the entry named by `command.commandName` from the supplied `executionAggregateRelease`. Ordinary actor commands must be exposed by the actor in that executing release. System and Agent owner commands and recorded external continuations retain their appropriate canonical-owner path. Selecting an executable entry does not grant an actor access to every owner contract.
2. **Entry versus public declaration:** preserve the existing real distinction between a public contract and a server adapter. `executionContract` may be either canonical entry; use existing `publicContract(executionContract)` where invocation, guard, payload or failure codecs require its public declaration. Run `executionContract.evaluate` and encode its result through that same selected entry. Do not create a second vague executable object or remove server-adapter behavior.
3. **Ordinary historical input:** resolve `command.contractVersion` within the execution contract's public version lineage. Preserve supported previous/next traversal and authored `up`/`down` adaptation, strict schema validation and unsupported-lineage refusal. Reuse existing lookup/adaptation machinery where it meets those requirements. Existing `getVersion` walks predecessors only; it must not silently remove currently supported successor/down-adaptation cases.
4. **Historical actor:** resolve exact actor name/version from `origin` within the named aggregate's supported declarations. Retain actor-version availability, claims-schema validation and aggregate-ID scope checks. Do not replace the recorded actor with the executing or latest actor merely because its name matches. Do not require that actor lookup pass through `command.aggregateVersion`.
5. **External continuations:** resolve the exact historical external declaration by owner-scoped contract name/version, and validate its frozen payload and recorded response against that declaration. Preserve Success/Failure observations, including successful JSON null, and the executing declaration's existing invocation validation. External contracts currently have no ordinary `up`/`down` upgrade lineage; do not invent an external adapter or feed them through ordinary payload adaptation. Keep this branch explicit and compact beside the ordinary `decodeAndAdaptPayload` step.
6. **Unambiguous definitions:** historical lookup must identify an exact canonical declaration. Repeated references to the same declaration are acceptable; conflicting declarations for one owner/name/version must fail declaration validation rather than select the first release or latest version. Add only the declaration validation needed for this invariant, reusing the existing `makeSystem`/declaration procedures. Add no persistent registry or second SQL source of truth.
7. **Remove original-release coupling:** neither execution preparation nor its failure-classification path may use `command.aggregateVersion` to recover source contracts/actors or establish that a command was once supported. Resolve support and failure codecs through the exact contract/Origin facts above. A missing original aggregate release alone must not prevent replay when all required contract/actor definitions are supported. A genuinely missing definition remains an explicit failure; do not guess or silently continue.

Preserve current recognized-refusal versus infrastructure-failure behavior while removing the release lookup that currently participates in that classification. In particular, a contract absent only from the replaying release must remain a retained replay refusal that advances progress, rather than an indefinite infrastructure failure. Missing required historical definitions, malformed input and authored failure encoding must keep explicit, source-grounded handling.

## Implementation scope

- Refactor [resolveAggregateExecution](../../../packages/system-worker/src/AggregateVersionRepo/utils/resolveAggregateExecution.ts) into the agreed domain steps. Delete unused source-owner intermediates and the superseded original-release resolver path.
- Propagate `executionContract` and `executionAggregateRelease` through [evaluateAggregateCommand](../../../packages/system-worker/src/AggregateVersionRepo/utils/evaluateAggregateCommand.ts), [executeAggregateOccurrence](../../../packages/system-worker/src/AggregateVersionRepo/utils/executeAggregateCommandTx.ts), [prepareAggregateOutput](../../../packages/system-worker/src/AggregateVersionRepo/utils/prepareAggregateOutput.ts) and directly affected call sites/types. Remove the second source-release lookup in replay refusal classification; business-failure encoding must use the resolved execution public declaration.
- Rename the existing shared `decodePayload` procedure/module to [decodeAndAdaptPayload](../../../packages/core/src/contracts/decodeAndAdaptPayload/decodeAndAdaptPayload.ts) including its recursive call, trace name, imports and directly referencing documentation. Propagate the name through Aggregate/Service session replay, standalone execution and the Service resolver. Keep the existing `adaptPayload` responsibility; add no alias or wrapper retaining the old name. Required shared rename propagation does not authorize redesigning Service execution.
- Keep invocation preparation and claims/result/failure codecs canonical. Avoid repeated decoding or historical lookup introduced solely to shuffle return fields; preserve necessary checks where both historical and executing declarations have distinct responsibilities.
- Update the relevant module READMEs, glossary and execution-resolution documentation during implementation. Correct the outdated blanket prohibition on aggregate contract-map lookup in the [local lookup pattern](../../patterns/system-worker/versioned-aggregate-repo-contract-lookup.ts): preserve exact historical actor lookup and exposure checks while documenting the agreed Origin-aware execution selection.

## Scope limits and transaction invariants

This plan changes execution resolution and naming. It does **not** settle removal or retention of replayed command rows, introduce a materialization-head table, split result outboxes, change projection bootstrapping, or implement the journal-column proposals in Plan 151.

Do not remove `aggregateVersion` from Chain commands, storage or wire contracts here. Its original-execution routing and ownership checks are separate from payload interpretation. Do not substitute this Repo's release for the command's original metadata.

Preserve synchronous evaluation, business-savepoint rollback, the outer materialization transaction, contiguous catch-up, duplicate recovery, exact model ownership and original-only external work. Resolution introduces no RPC or asynchronous work inside the transaction. Original and replay execution continue to use this Repo's selected program and resources.

No fixed-schema change or storage reset is intended. Retain the pre-release hard-cut policy: remove superseded names/paths outright without compatibility aliases, fallback original-release lookup or translation machinery. Preserve unrelated and concurrent work, including [completed Plan 188](188-plan-aggregate-version-repo-model-operation-storage.md).

## Verification and completion

- [x] Implement the agreed procedure names, terminology and compact orchestration; remove the old resolver coupling and unused paths.
- [x] Verify ordinary same-version decoding and declared older/newer payload adaptation, exact actor/claims/scope handling, actor exposure and canonical-owner execution selection.
- [x] Verify replay using an available historical contract/actor after its original aggregate release is absent, and explicit refusal/failure for unsupported or conflicting definitions.
- [x] Verify canonical public/server entry selection, local result and business-failure codecs, recorded external Success/Failure/null response validation and rejection of ordinary/external mismatches.
- [x] Verify unsupported replay contracts still advance as retained refusals; defects/infrastructure failures preserve Cause and commit no false progress. Preserve rollback, model binding, duplicate recovery and original-only external work.
- [x] Run existing scoped Nx type/lint checks and relevant existing acceptance/Workerd seams. Create no new tests, fixtures, check runners or configuration. Use the smallest existing behavioral assertions that prove these changes; record unavailable evidence as unfinished work.
- [x] Reconcile docs/glossary/patterns and required shared helper-rename consumers. Record actual verification and archive only when all implementation and verification work is finished.

Current evidence: [payload version traversal](../../../packages/core/src/contracts/decodeAndAdaptPayload/decodeAndAdaptPayload.ts), [exact actor lookup](../../../packages/core/src/aggregateActor/getAggregateActorVersion.ts), [external response codec](../../../packages/core/src/contracts/externalOutcomeCodec.ts), [execution/refusal classification](../../../packages/system-worker/src/AggregateVersionRepo/utils/executeAggregateCommandTx.ts), [canonical contract entry accessor](../../../packages/core/src/contracts/make/constructContractVersion.ts).

Planning snapshot: commit `e551f2dda217753685666442ae29a15e1ef5c719`; `resolveAggregateExecution.ts` SHA-256 `eda0b2f3cee106e4816a2b3dec34d1fa6364c1810031c6ceabf40e521198fdab`. Recheck current source before implementation because other chats are active in this checkout.

## Completion evidence

1. The compact resolver selects the executing public/server entry, resolves exact supported historical declarations and actor claims, and decodes/adapts payloads without consulting the admitted aggregate release. The shared helper rename and all in-scope consumers are complete.
2. `node scripts/verify-plan140.mjs` passed all nine groups. Existing production seams prove owner-scoped declarations, exact historical actor/claims/scope and exposure checks, bidirectional payload adaptation, absent-original-release replay, conflicting declaration rejection, server/public entry selection, external Success/Failure/null codecs, retained refusals, savepoint/outer rollback, model binding and duplicate recovery.
3. `pnpm nx run-many -t ts lint test-workerd-ts -p @zerospin/core system-worker @zerospin/browser @zerospin/dev-worker @zerospin/production-worker @zerospin/sdk @zerospin/native --nxBail` passed the applicable targets and dependencies. The final Workerd typecheck passed after test updates. The four scoped Workerd files passed all 17 checks; the joint Plan 190 records the exact invocation and wider recovery evidence.
4. Independent source review found no confirmed correctness defects. Module READMEs, glossary, local patterns and architecture citations match the final source. No new test files, fixtures, runners or test configuration were created. Unrelated WIP and the historical Plan 188 record were preserved.

## Remaining work

None.
