# Command origin classification and explicit authority dispatch

**Date:** 2026-10-15

**Status:** Superseded by [Plan 265](265-plan-flat-command-origins.md) and
[ADR 023](../../adrs/023-flat-command-origins-and-claims-free-continuations.md).
The three-object-origin/no-storage-change proposal below is historical and is not
an additional implementation requirement. The updated [consumer review](../../reviews/command-origin-consumers.md)
records current dispositions.

**Evidence:** [Origin consumer inventory](../../reviews/command-origin-consumers.md) and [Effect Schema research](../../research/command-origin-schema-guards.md).

## Problem and intended result

The 45 explicit origin checks serve different purposes: selecting invocation context, binding stable session identity, decoding actor claims, choosing a private result owner, and constraining administrative or agent-only interfaces. Replacing every comparison with `Schema.is` would obscure that distinction and add full-shape validation after existing decoders.

Make complete actor/agent/System dispatch explicit, preserve readable local classification, and account for every inventoried consumer and the related equality/retention paths. Keep each permission, ownership, ordering and recovery requirement visible at its actual owner. The desired result is clearer reasoning, not a lower count of discriminator comparisons.

## Model and scope

- Keep the three current `kind` values: `actor`, `agent`, `system`. No session-specific command variants or nested authority wrapper.
- Keep `nodeId`, `sessionName` and `pushIndex` separate from origin. Preserve AggregateChain's unique `(nodeId, pushIndex)` constraint and all-null/all-present tuple rule.
- Preserve Actor name/version/claims and Agent name/version as retained context within its exact enclosing Aggregate/Service release. Do not replace retained source context with current session identity or the newest declaration during replay.
- Keep System ingress restrictions and existing external-continuation restrictions. Refresh the continuation inventory against current source before changing it; this plan does not restore a superseded service `caller` shape.
- Keep the serialized origin shapes and schema AST unchanged. This is a classification/dispatch change, not a storage cutover or reset.
- Preserve current errors, duplicate-first admission, synchronous transaction boundaries, external-work lifecycle and private completion filtering.

## API choices

| Situation                                               | Planned choice                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Untrusted transport or retained row input               | Keep the existing shared decoder/row codec, useful diagnostics and boundary-specific excess-field policy.                                                                                                                                               |
| A boolean full decoded-shape check is actually required | `Schema.is(schema)` or a generated member guard is appropriate; document why a boolean is the required interface. No such replacement is justified merely by an origin tag branch.                                                                      |
| Already decoded union, one clear local branch           | Keep direct literal discrimination. Do not introduce one-use helpers or revalidate the complete actor/claims object.                                                                                                                                    |
| Complete actor/agent/System dispatch                    | Augment the existing command-origin schema with `Schema.toTaggedUnion('kind')`, then use its exhaustive `.match`.                                                                                                                                       |
| Meaningful grouping of variants                         | `.isAnyOf(...)` is available, but is not mandated; it assumes typed input and the installed generic does not constrain its key list.                                                                                                                    |
| Permission, identity or private completion ownership    | Keep each check at its authority: trusted ingress owns submission permission, VersionRepos own Actor-aware execution, and selected Chains own connection/private completion identity. Neither schema validity nor a discriminator proves authorization. |

Do not substitute `Predicate.isTagged`, which uses `_tag`, or change the origin discriminator to accommodate it. Do not use a default matcher branch that classifies unhandled origins as System.

## Planned changes

1. **Refresh and disposition the consumer inventory.** Re-run its source search against the current checkout. For every recorded site, state whether its current check is retained, its complete dispatch is made exhaustive, its prompted purpose needs a comment, or it exposes a separately evidenced defect. Follow linked whole-origin equality and conversion paths too. Do not infer a defect from a tag comparison alone or repair unrelated concurrent work.
2. **Expose generated complete dispatch only for a surviving consumer.** After refreshing the inventory, use `.pipe(Schema.toTaggedUnion('kind'))` on an existing command-origin schema only where a concrete complete dispatch remains. Retain member schemas, tags, exported types and the independent session-origin subset. Do not add an unused matcher after removing the former Chain permission dispatch or create a second origin registry.
3. **Ordinary Chain permission dispatch is superseded.** [Plan 261](261-plan-scoped-repo-spec-checks.md) removes the Actor/Agent submission-permission validators from AggregateChain and ServiceChain. Both resolve ordinary contracts through the enclosing release, retaining owner/release/version/payload, ordinary/external, non-Actor producer/claims, idempotency and ordering checks. Actor session capabilities and compiled Agent Node behavior own submission permission at ingress. VersionRepos retain Actor-aware execution, full claims interpretation and guards. Do not recreate the deleted validators or a matcher around them.
4. **Refresh service continuation conversion before making a remaining dispatch exhaustive.** The original `asyncOperations/readPreparedAsyncCommand.ts` location and service `caller` shape are historical. Trace the current external continuation owners and preserve frozen Origin, cleared producer tuples, external-observation checks, complete recorded-input proof and strict decoding. Change only a surviving complete dispatch that benefits from exhaustiveness; do not restore obsolete refusal or caller machinery.
5. **Preserve and clarify the remaining consumer roles.** Apply the work groups below; retain direct checks when they are already the clearest representation. Add only comments that explain an otherwise non-obvious invariant. Do not scatter pending-refactor TODOs across unchanged code.
6. **Verify the bounded change and reconcile the records.** Run existing scoped checks, inspect the affected generated/public types and update this plan plus the inventory with actual outcomes. No repository-wide formatting, test infrastructure, new guard framework or unrelated origin/API migration.

The former `AggregateCommandOriginSchema.match(...)` sketch around
`validateActorCommand`, `validateAgentCommand` and `validateSystemCommand` is
withdrawn. Those helpers duplicated ingress permission and are removed by
Plan 261. A generated matcher must serve an actual remaining dispatch; compile
that consumer's Effect handlers rather than force inference with a cast or wrapper.

## Consumer work groups

The [inventory](../../reviews/command-origin-consumers.md) owns the individual source links and check explanations; avoid duplicating its 27-file table here.

| Group                                                       | Required treatment                                                                                                                                                                                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary admission and service continuation conversion      | Preserve Plan 261's structural-only Chain admission. Refresh current continuation code and make an actual remaining complete dispatch exhaustive, without restoring permission lookup.                                                    |
| Execution resolution and actor read context                 | Preserve ordinary versus external-continuation lookup, exact retained actor version/claims decoding and actor-scoped read behavior. Keep clear actor comparisons; classification must not accidentally select canonical reads.            |
| Access, locks, tickets, forwarded connections and bootstrap | Preserve stable actor/agent identity and admitted capabilities. Keep per-command `pushIndex` out of locks/snapshots. Retain application actor-only and agent-only interface distinctions.                                                 |
| Projection and private completion                           | Preserve concrete actor identity/claims, actor/agent definition, session, Node and private output checks. A schema predicate cannot replace these ownership conditions.                                                                   |
| Client/native initialization and pending replay             | Preserve strict definition/identity matching, retained origin equality and existing incompatible-storage/recovery behavior. Coordinate with the current replica-recovery work rather than restoring an older failure path.                |
| Browser Node and standalone execution                       | Preserve actor-only application Node acceptance, pre-retention page claims checks, position allocation and valid local evaluation context. Exact retries remain ahead of current admission checks.                                        |
| CLI administrative seeds                                    | Preserve System-only aggregate seed selection through its existing trusted command interface.                                                                                                                                             |
| Equality, persistence and external-work paths               | Preserve complete immutable input recovery, consistent origin over a Node stream, separately indexed producer positions, stable reconnect equality and exact recorded continuation reconstruction. Replay never reproduces external work. |

## Verification and completion

Use existing scoped Nx type/build/lint targets for core and system-worker and affected consumers, following current target configuration. Reuse existing admission profiles and relevant identity/replay verification seams. Create no test files, fixtures, test/check runners or configuration. Add no `ALLOWED_CAST`.

Required evidence:

- Where a surviving consumer justifies a generated matcher, its typing accepts current Actor/Agent/System handlers and requires complete dispatch. The command/session unions retain their current decoded and encoded shapes.
- Chain admission preserves Plan 261's structural checks and duplicate-first recovery without current Actor/Agent permission lookup. Ingress capabilities and Agent producers retain submission permission; VersionRepos retain Actor-aware execution and claims restrictions.
- Recorded service continuation preserves frozen Origin and current supported restrictions without restoring obsolete caller representations. Successful external JSON null and failure observations keep their established semantics.
- Malformed input is refused by the owning decoder rather than classified by a tag-only predicate. Existing strict-excess behavior is preserved where selected; this plan does not silently introduce a new global policy.
- Exact retries, consecutive Node positions, synchronous rollback and contradictory acknowledgement refusal are unaffected.
- Stable session origin matching and private completion ownership still include their actual identity/session/Node requirements; classification changes grant no new visibility.
- Replay uses retained source context and does not produce external work. The origin schema AST and separate Node/position index remain unchanged.
- Every refreshed consumer and linked equality/conversion responsibility has a recorded disposition. Remaining direct `.kind` comparisons are expected, not a failing completion criterion.

Record unavailable existing seams or unrelated checkout failures as limits rather than inventing new infrastructure or claiming runtime coverage from the research's in-memory API probe. Archive this child plan only after implementation and its required evidence are complete. Its completion does not advance unrelated storage-table reviews.

## Remaining work

None for this superseded proposal. Plan 265 owns the replacement implementation
and verification; this record claims no independent runtime completion.

## Agent composition reconciliation

[Plan 264](264-plan-owner-local-agents-and-node-selection.md) and
[ADR 022](../../adrs/022-owner-local-agents-and-explicit-node-selection.md) replace global Agent registries/pins with owner-release
`agents` maps and explicit owner-scoped Node selections. Origin dispatch must
preserve the command's recorded owner version and Agent Origin; it must not use
current Node selection as admission or observation permission. Frozen Node
commands drain unchanged after binding removal or replacement. Complete
owner-spec checks include embedded Agent specs; catalogue Agent identities are
owner-local and exclude enclosing release version.
