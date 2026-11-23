# Handoff: exposed commands and private command resolutions

**Status — 2026-10-27:** Archived after incorporation into completed
[Plan 207](../plans/207-plan-actor-model-exposure-and-aggregate-command-names.md).
Its naming, atomic publication and private recovery decisions are implemented;
[Plan 275](../plans/275-plan-actor-version-chain-archives.md) subsequently moved
retained Actor history into Archives. **Remaining work: none.**
The focus, pickup instructions and open decisions below describe the original
handoff only. They authorize no new renames, schema cutover or history copies.

**Date:** 2026-10-16
**Focus:** Carry the accepted names and local storage design into the parent chat; reconcile them with Plan 207 before implementation.

**Incorporated:** The receiving chat expanded [Plan 207](../plans/207-plan-actor-model-exposure-and-aggregate-command-names.md) and authorized implementation, including the same names and storage decisions for Service Actor architecture. Aggregate Agent physical storage remains unchanged. The remaining/open decisions below describe the original handoff boundary; Plan 207 now governs the implementation and verification status.

## Goal

Use **exposed command** for the Aggregate command representation and **command resolution** for its optional private recipient/failure information. Preserve one complete pending publication, normalize retained actor history into public commands and private resolutions, and keep one atomic append and browser command stream.

## Done

1. **Accepted terminology:** use `commandResolution` for the singular private concept and pending object, and `commandResolutions` for the retained child table. Resolution covers success and refusal and aligns with `resolvedThrough`. It does not rename canonical `outcome`, which remains `{ result: Success | Failure, finalizedAt }`.
2. **Latest accepted rename:** the user explicitly added `projectedCommand` -> `exposedCommand`. Apply the corresponding Aggregate plural and identifier forms in the design below. This supersedes this conversation's earlier preservation of the Aggregate physical `projectedCommand*` names and Plan 207's conflicting instruction to retain them.
3. **Existing agreed API names:** retain Plan 207's actor `exposedModels`, `IAggregateExposedCommand`, `AggregateExposedCommandSchema` and `makeAggregateExposedCommand`. Keep `delta`, `selections`, `capturedSelections` and independently meaningful `db.models`, contract/session/lock `models` unchanged. Refer to Plan 207 for its existing caller inventory and naming scope rather than recreating that plan here.
4. **Accepted storage direction:** keep one complete pending row in AggregateActorVersionRepo, and separate retained public commands from private resolutions inside AggregateActorVersionChain. The user accepted the proposed structure with “ok” before adding the latest rename. This accepts the design; the active request is to write this handoff, not implement it.
5. **Rejected direction for this work:** do not derive private recovery remotely from AggregateVersionChain or introduce an independently delivered resolution stream. Remote derivation adds an availability dependency and changes the replay/live handoff. Local table normalization does neither.
6. Only this handoff is updated. Production code, physical storage, Plan 207, the glossary and ADRs remain unchanged. No runtime verification was performed.

## Agreed structure

1. AggregateActorVersionRepo owns one complete pending publication:

   ```text
   exposedCommandOutbox
     aggregateIndex                 PRIMARY KEY
     dispositionChainHash
     id                             canonical admitted command ID
     commandName
     delta                          frozen selected resource transition
     commandResolution              nullable object:
       nodeId                       required
       pushIndex                    required
       sessionName                  required
       claims                       required, complete original actor claims
       failure                      nullable public failure
   ```

2. AggregateActorVersionChain owns the two retained relations:

   ```text
   exposedCommands
     aggregateIndex                 PRIMARY KEY
     dispositionChainHash
     id                             UNIQUE
     commandName
     delta

   commandResolutions
     aggregateIndex                 PRIMARY KEY, REFERENCES exposedCommands
     nodeId                         NOT NULL
     pushIndex                      NOT NULL
     sessionName                    NOT NULL
     claims                         NOT NULL
     failure                        nullable public failure

     UNIQUE (nodeId, pushIndex)
   ```

3. A missing resolution means this projection owns no private resolution. A present resolution requires every recipient field; null `failure` means owned success, and a supplied failure means owned refusal. Preserve full claims, including claims outside the actor path. Fixed Actor Origin kind/name/version come from the immutable bound owner.
4. The resource transaction commits resources, materialization head and the complete pending publication together. AggregateActorVersionChain atomically appends the exposed command and optional resolution, then acknowledges that complete publication. Only that durable acknowledgement permits deletion of the pending row; retained Chain history remains.
5. Public-row insertion seals either its one resolution or its absence. An identical retry must match the exposed command and joined resolution-or-null. Reject changes to either fact, including attaching a resolution later. Do not add an independent resolution insertion method, queue, acknowledgement or lifecycle flag.
6. Private recovery queries the local resolution relation, preserves exact Node/session/full-Origin checks and contiguous push progress, and remains bounded by the selected snapshot's captured Aggregate position. Browser delivery joins the resolution to the exposed command and filters its failure for the admitted recipient. `IAggregateExposedCommand` keeps its existing encoded fields, including nullable private `failure`; claims and producer metadata remain server-side. Preserve synchronous transaction boundaries and the synchronous replay/live handoff.
7. Corresponding Aggregate names are `exposedCommands`, `exposedCommandOutbox`, `aggregateExposedCommandsTable`, `makeExposedCommandOutbox` and `appendExposedCommands`. These replace their `projectedCommand*` forms without compatibility aliases. This is a command-family rename, not a global replacement of every use of “projection.”

## Remaining

1. Reconcile Plan 207 with these later decisions. Its current scope explicitly retains physical `projectedCommand*` names and excludes history normalization; those statements are stale relative to this handoff. Decide where to record the storage implementation work without silently treating the unchanged naming-only plan as a complete implementation plan.
2. Preserve Plan 207's already agreed actor/API naming work. Do not re-approve settled names or change `delta` to `exposedDelta`.
3. Inspect current source and unrelated WIP before implementing. The storage redesign here concerns the AggregateActorVersionRepo/AggregateActorVersionChain physical occurrences; shared declarations are not approval to redesign Agent or Service storage. Migrate direct callers of renamed Aggregate interfaces as required without silently broadening storage scope.
4. Implement only within authorization in the receiving chat. Changed fixed actor outbox/history schemas require empty affected storage, with no translation, decoder fallback, compatibility alias or automatic reset. Plan 207's separate accepted-definition cutover remains applicable.
5. Complete scoped existing verification and reconcile source docs/glossary after implementation. Create no test files, fixtures or runners without explicit authorization; never verify Explorer. No implementation or verification is completed by writing this handoff.

## Suggested skills

1. `$grill-me` — reconcile the implementation plan and resolve only genuinely unsettled scope or design questions; do not reopen the accepted structure and names.
2. `$use-morgs32-wiki-patterns` — consult relevant local ownership, publication and replay guidance.
3. `$implement` — carry authorized implementation and required verification through completion in the receiving chat.

## Pointers

1. [Plan 207](../plans/207-plan-actor-model-exposure-and-aggregate-command-names.md)
2. [Existing research and earlier alternatives](../../research/aggregate-projected-command-completion-designs.md)
3. [Original storage-table review](../../reviews/storage-tables/aggregate-actor-version-repo-projected-command-outbox.md)
4. [Aggregate ownership ADR](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md)

## Open decisions

1. How to organize the storage work alongside Plan 207 remains open. Creating this handoff does not modify or archive that plan.
2. Agent and Service physical schema changes are not settled by this actor storage decision. Do not infer a repository-wide persistence cutover from shared Aggregate types or helper names.
3. Current source has not been migrated to this design. Earlier research records alternatives and older terminology; use the explicit accepted decisions above when resolving conflicts.
