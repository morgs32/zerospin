# Remove remaining binding concepts

Status: Completed and verified — 2026-10-12. Implemented in isolated worktrees and published as three coherent phases. PRs 51 and 52 are merged; PR 53 is rebased onto remote main containing both. Archived after required implementation and verification completed; PR 53 remains unmerged.

## Pull request phases

1. **Explicit session inputs** — `codex/143-session-inputs`, based on `main`. Remove the native shared input bundle, retain its boundary decoder and direct dependencies, rename React's captured inputs/failure, and reconcile its current callers, guides, and obsolete frontend pattern. Verify the client compiler/library graph and the existing React/native runtime probes.
2. **Direct execution and agent declarations** — `codex/143-execution-declarations`, initially based on phase 1 and now independently based on `main` after PR 51 merged. Rename cohesive execution resolution and direct owner/declaration facts, remove the unused contract-wrapper type, update agent/session identity failures, and reconcile directly affected backend workflows, glossary and TODOs. Verify the compiler/library/lint graph and the existing contract/runtime check. No fixed storage schema changes belong to this phase.
3. **Node-owned aggregate storage identity** — `codex/143-node-identity`, initially based on phase 2, independently rebased onto `main` after PR 51 merged, and rebased again after PR 52 merged. Move retained ownership and pre-deletion checks into aggregate node metadata/initialization, remove the standalone sidecar/provisioning hook, add the explicitly authorized focused runtime check, reconcile storage workflow/ADR/README records, complete cross-phase verification, and archive this plan. This phase owns the version-12 to version-13 empty-storage cutover.

Each PR contains its own relevant documentation and validation evidence. Temporary implementation worktrees may develop independent scopes in parallel; the initial publication used a linear stack. After PR 51 merged, the maintainer requested both remaining phases directly on remote main, each retaining only its own commits. Phase 3 does not depend on Phase 2 code. Each phase is verified against its actual parent branch. Preserve unrelated WIP in the original checkout. Do not merge the remaining PRs as part of this request.

## Problem and scope

Plan 053 removed initialization-installed command methods and the hidden method registry. Its ownership rule still applies: declarations describe authored behavior, initialization acquires resources and admission facts, and ordinary functions execute against those facts. Remaining binding names sometimes obscure these existing constructs; the native bundle and standalone sidecar also hide or duplicate ownership.

This work removes those remaining concepts in the audited core, browser, native, React, system-worker, and directly affected documentation. It does not replace them with another registry, installed strategy, generic context, or renamed bundle.

1. Delete the unused contract-wrapper inference type and obsolete frontend convention. Reconcile current glossary and TODO descriptions after implementation.
2. Remove the native shared input bundle, retain pre-acquisition validation, and pass each procedure its actual dependencies.
3. Preserve React's captured construction inputs and credential refresh behavior while naming that state `initialInputs`.
4. Describe execution resolution, retained owner identity, and agent contract declarations directly in functions, variables, comments, and failures.
5. Move standalone aggregate ownership into aggregate node metadata and remove the sidecar table and provisioning callback.
6. Preserve actual Cloudflare bindings, SQL parameter bindings and `selectionBindings`, JavaScript binding terminology, and authored agent `.bind` payload-to-row field maps. Service-node storage, native replica storage, archived records, generated `graft/**` indexes, and vendored code are outside the cutover.

## Baseline evidence

1. [Plan 053](053-plan-remove-command-bindings.md) records the completed removal of assembled command behavior. The prior chat is [Explain activation-owned command](codex://threads/01a11267-dc07-75f2-9b74-2d67a6709c52).
2. [Standalone authority and storage scope](../../adrs/004-standalone-authority-and-storage-scope.md) requires one immutable aggregate owner per storage path, independent declaration compatibility, serialized execution, and reset fencing. Those invariants continue to govern; changing the physical location of identity facts does not supersede the ADR.
3. [Aggregate node metadata](../../../packages/core/src/AggregateNode/aggregateNodeTables.ts) currently retains `sessionKey` but not the aggregate ID. [AggregateNode.initialize](../../../packages/core/src/AggregateNode/AggregateNode.ts) owns schema creation and baseline installation in its SQL transaction, but invokes a standalone-only provisioning callback.
4. [The standalone worker](../../../packages/browser/src/StandaloneNode/makeStandaloneWorkerRuntime.ts) currently validates the sidecar before initialization. The sidecar retains `aggregateId` and `definitionHash` separately from node metadata.
5. [Native decoding](../../../packages/native/src/decodeNativeSessionInputs.ts) validates cloned configuration, claims, and the Node request before opening files. Its two consumers require different subsets of the returned bundle.
6. [React input capture](../../../packages/react/src/makeReactApp/sessionInputs.ts) already implements semantic equality of fixed construction inputs and excludes the refreshing credential provider.
7. [Contract entries](../../../packages/core/src/contracts/types.ts) are direct registry values. `InferContractGuardRequirements<BINDINGS>` still assumes a `{ contract }` wrapper and has no current repository callers.

## Agreed behavior and terminology

1. `sessionRelease` denotes the authored release. Native validated construction facts are local `configuration`, `claims`, and `request` values; introduce no `INativeSessionInputs` replacement bundle. Rename the useful decoder to `decodeNativeSessionInputs` and destructure its result in the parent.
2. `openNativeNodeOwner` receives `request`, `claims`, `configuration`, and `signal`. `openPersistentAggregateReplica` receives `sessionRelease`, `claims`, `owner`, and `signal`. Keep configuration cloning, request/claims decoding, exact identity checks, file lease ownership, and resource disposal in their present order.
3. React retains `initialInputs` for the mounted owner's lifetime. Equal fixed inputs retain the owner; changed fixed inputs require remounting. The latest committed `getCredentials` callback remains usable without replacing the owner.
4. Rename `bindAggregateExecution` and `bindServiceExecution` to `resolveAggregateExecution` and `resolveServiceExecution`. Keep their cohesive resolution and validation behavior. Callers destructure the resolved `contract`, `implementation`, `actor`, `claims`, and `decodedPayload` facts as applicable. Preserve source lineage, ordinary/external distinctions, exact actor versions, claims validation, payload conversion, guard ordering, result encoding, and transaction boundaries.
5. Rename `validateAgentBindings` to `validateAgentDeclarations`; use `agentContract` for `IAgentContract` values. Preserve canonical contract/model identity, field membership and decoded value compatibility, snapshots, freezing, and the existing `.bind` map. Ordinary AggregateApi and ServiceApi state is retained owner identity; constructors and admission procedures receive or destructure those existing fields directly.
6. Name resource/model lookup and query objects for what they resolve: the Node delta helper becomes `resolveResourceModel`, and aggregate authorization's local query variable becomes `modelQuery`. These are local clarity changes, without new forwarding procedures or public interfaces.
7. Preserve the names and ownership of existing declarations, actors, capabilities, session locks, storage namespaces, and command records. No new execution discriminator, method table, callback catalog, compatibility alias, or cast exemption is introduced.

Public failures and the WebSocket close reason change together with their current callers and documentation:

| Current spelling                             | Planned spelling                                | Meaning                                                                      |
| -------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `session-binding-inputs-changed`             | `session-inputs-changed`                        | A mounted React owner's fixed construction inputs changed.                   |
| `agent-session-binding-invalid`              | `agent-session-inputs-invalid`                  | Agent construction inputs disagree with the release or are empty.            |
| `agent-session-binding-mismatch`             | `agent-session-identity-mismatch`               | Bootstrap snapshot identity disagrees with the requested agent session.      |
| `agent-bootstrap-binding-invalid`            | `agent-bootstrap-identity-invalid`              | Requested recovery identity does not match the registered agent declaration. |
| `aggregate-session-command-binding-mismatch` | `aggregate-session-command-identity-mismatch`   | Submitted command identity disagrees with retained admission.                |
| `session-binding-invalid`                    | `session-identity-invalid`                      | Connection origin or producer identity arguments cannot be decoded.          |
| `standalone-storage-binding-conflict`        | existing `standalone-storage-identity-mismatch` | Storage or a warm owner belongs to another aggregate/declaration.            |

## Aggregate storage ownership

1. Add only `aggregateId: text().notNull()` to `aggregateNodeMetadata`. The physical table remains `nodeMetadata`. Keep declaration compatibility in the existing `sessionKey`: connected/native keys include `definitionHash`, and the standalone override hashes the storage namespace, aggregate ID, and exact lock. A second persisted `definitionHash` column would duplicate that proof.
2. Bump AggregateNode's fixed schema version from 12 to 13. ServiceNode has a separate metadata definition and independent version 13; leave it unchanged. The native session replica has its own version 2; leave it unchanged.
3. Move validation into `AggregateNode.initialize`'s existing gate and SQL transaction. For every nonempty database, check the current fixed schema version before reading current metadata. An unsupported version refuses with `node-storage-reset-required`, including an explicit replacement request.
4. Before any schema or row deletion, read current metadata and compare its `aggregateId` with the requested definition's aggregate ID. A different aggregate refuses even when reset/replacement is requested. Use `standalone-storage-identity-mismatch` for standalone ownership refusal and retain `node-storage-identity-mismatch` for connected ownership refusal.
5. Without replacement, compare the retained `sessionKey` with the computed key. A standalone declaration mismatch requires `node-storage-reset-required`; connected identity mismatch retains its existing failure. An identical reopen returns the retained journal and node identity without rewriting them.
6. After validating a current-schema standalone database's aggregate owner, explicit replacement may recreate the declaration's tables, insert metadata with the same `aggregateId` and the new `sessionKey`, and install the baseline in one transaction. An empty file may be initialized directly. Keep existing foreign-key handling and rollback behavior.
7. Remove the worker's sidecar lookup, sidecar SQL provisioning, `standaloneBinding.ts`, and the core `provisionBinding` constructor member/call. Keep the existing storage namespace and computed storage key. The Node owns its complete fixed storage schema and retained ownership checks; introduce no replacement hook.
8. Preserve warm-owner aggregate/declaration checks before reset. Ordinary reset preserves `aggregateId` and `sessionKey`, atomically replaces the baseline, rotates `nodeId`, and keeps queued work and saved attachments fenced by their captured node identity.
9. The framework metadata cutover requires empty affected aggregate Node storage in connected browser, standalone browser, and native Node files. Do not read the removed sidecar, copy deprecated rows, accept old version-12 metadata, or perform a compatibility migration. Application declaration reset against the new metadata schema remains supported after the owner check.

## Decisions and rejected alternatives

1. Remove native dependency hiding rather than renaming the shared bundle. Keeping the decoder concentrates boundary validation; passing only required facts makes ownership visible at each caller.
2. Retain execution-resolution procedures because they own real source/actor/contract validation. Removing them would spread that work across callers. Rename and destructure their data instead of manufacturing another execution object.
3. Put aggregate ownership in the Node's metadata rather than renaming the standalone sidecar. This eliminates a special table, a provisioning callback, and duplicate initialization ownership.
4. Retain one canonical declaration-compatibility key rather than persisting both `sessionKey` and `definitionHash`. Explicit `aggregateId` supplies the separate owner fact needed before reset.
5. Validate ownership inside the existing initialization transaction before destructive work. A worker-level precheck alone leaves the class able to replace storage without enforcing its own owner invariant.
6. Keep the original standby/connected/native lifetimes and authority checks. This cleanup changes representation and names, not who authenticates, serializes work, owns SQLite, or delivers commands.

## Planned file hierarchy

Legend: `+` creates a file, `~` modifies it, `-` deletes it. A rename is shown as deletion and creation of the same responsibility at its new path. The saved verification file is explicitly authorized; no other new test/fixture/runner files or configuration are authorized by this plan.

```text
zerospin/
├── ~ AGENTS.md                              # renamed validator in existing examples only
├── ~ TODOS.md
├── scripts/
│   └── + verify-session-identity.mjs          # explicitly authorized focused check
├── packages/
│   ├── core/src/
│   │   ├── AggregateNode/
│   │   │   ├── ~ aggregateNodeTables.ts
│   │   │   ├── ~ AggregateNode.ts
│   │   │   └── ~ README.md
│   │   ├── Node/~ applyNodeResourceDeltaTx.ts
│   │   ├── contracts/~ types.ts
│   │   ├── agent/
│   │   │   ├── ~ makeAgentContract.ts
│   │   │   └── ~ makeAggregateAgentSessionRelease.ts
│   │   └── system/
│   │       ├── project/~ projectOwnerSpec.ts
│   │       └── make/makeSystem/
│   │           ├── ~ makeSystem.ts
│   │           ├── - validateAgentBindings.ts
│   │           └── + validateAgentDeclarations.ts
│   ├── native/
│   │   ├── ~ README.md
│   │   └── src/
│   │       ├── - decodeNativeSessionBinding.ts
│   │       ├── + decodeNativeSessionInputs.ts
│   │       ├── ~ makeNativeSession.ts
│   │       ├── ~ openNativeNodeOwner.ts
│   │       ├── ~ openPersistentAggregateReplica.ts
│   │       └── ~ index.ts
│   ├── react/
│   │   ├── ~ README.md
│   │   └── src/makeReactApp/
│   │       ├── ~ makeReactApp.tsx
│   │       └── ~ sessionInputs.ts
│   ├── browser/src/
│   │   ├── StandaloneNode/
│   │   │   ├── - standaloneBinding.ts
│   │   │   ├── ~ makeStandaloneWorkerRuntime.ts
│   │   │   ├── attach/~ attach.ts
│   │   │   └── snapshot/~ snapshot.ts
│   │   ├── agentSession/~ connectAgentSession.ts
│   │   └── makeBrowserSession/~ createAggregateAgentBrowserSession.ts
│   └── system-worker/src/
│       ├── AggregateApi/
│       │   ├── ~ AggregateApi.ts
│       │   └── admit/~ admit.ts
│       ├── ServiceApi/
│       │   ├── ~ ServiceApi.ts
│       │   └── admit/~ admit.ts
│       ├── AggregateVersionRepo/
│       │   ├── authorizeSession/~ authorizeSession.ts
│       │   └── utils/
│       │       ├── - bindAggregateExecution.ts
│       │       ├── + resolveAggregateExecution.ts
│       │       ├── ~ evaluateAggregateCommand.ts
│       │       ├── ~ executeAggregateOccurrence.ts
│       │       └── ~ prepareAggregateOutput.ts
│       ├── ServiceVersionRepo/utils/
│       │   ├── - bindServiceExecution.ts
│       │   ├── + resolveServiceExecution.ts
│       │   ├── ~ evaluateServiceCommand.ts
│       │   ├── ~ executeServiceOccurrence.ts
│       │   └── ~ prepareServiceOutput.ts
│       ├── aggregateProjection/getSnapshot/~ getAgentBootstrap.ts
│       └── aggregateSessionChain/
│           ├── ~ README.md
│           ├── onConnect/~ onConnect.ts
│           └── onMessage/~ admitAggregateSessionCommand.ts
├── fragment/content/
│   ├── reference/~ react.md
│   ├── guides/
│   │   ├── ~ react-and-nextjs.md
│   │   └── ~ authenticate.md
│   └── handbook/~ sessions-and-synchronization.md
└── wiki/
    ├── plans/+ 143-plan-remove-remaining-binding-concepts.md
    ├── ~ glossary.md
    ├── adrs/~ 004-standalone-authority-and-storage-scope.md
    ├── architecture/
    │   ├── ~ AuthoredSystem.md
    │   ├── browser/~ StandaloneSharedWorkerExecution.md
    │   └── server/
    │       ├── ~ executeAggregateCommand.md
    │       └── ~ serviceExecution.md
    └── patterns/
        ├── ~ index.md
        ├── react/- versioned-frontend-binding.ts
        └── system-worker/~ aggregate-session-admission.ts
```

## Implementation sequence

1. Recheck the scoped source and current working tree before execution. Preserve unrelated work. Use the existing local patterns and resolved Nx project configuration; do not broaden verification to unrelated failures.
2. Implement aggregate metadata ownership and pre-deletion validation together, then remove the standalone sidecar and callback. Verify fresh creation, identical reopen, and refused replacement before undertaking mechanical terminology changes.
3. Remove the native shared bundle. Rename the decoder and its import/export paths, destructure validated facts once, and narrow each consumer's inputs. Preserve cloning and validation before either native file is acquired.
4. Rename React captured inputs and the current public failure spellings. Update agent construction/bootstrap and WebSocket admission failures at the same time. Do not retain old error-code aliases or dual recognition paths.
5. Rename execution resolution files/symbols and update every scoped runtime, type-only, and telemetry reference. Replace local generic binding variables with direct execution facts, owner identity, agent contracts, resource models, or model queries. Delete the unused wrapper type and obsolete frontend pattern outright.
6. Run the selected runtime checks and the smallest applicable compiler/library/lint graph. Confirm identical stored identity survives reopen and refusals occur before any storage mutation. Do not claim old archived checks or disabled Nx tasks as current verification.
7. After implementation, reconcile current README/reference material, glossary, existing patterns and governing ADR wording. Refresh renamed architecture source links, ranges, hashes, diagrams and their matching annotations. Inspect the CLI seed TODO against current code before removing it; retain unrelated outstanding behavioral coverage under current terminology. Preserve historical archives and generated indexes.
8. Record actual implementation and verification evidence in this plan. Use `implement` to resolve remaining required work and archive the same filename only when no work remains.

## Verification seams

1. Exercise production `AggregateNode.initialize`, `reset`, and standalone worker attachment through their existing injected SQLite/storage interfaces. Use current emitted modules and real SQLite, not assertions that mirror private helper code. Cover a small number of scenarios:
   1. Fresh storage contains the aggregate ID and canonical session key, has the new schema version and baseline, and has no `standaloneBinding` table. Identical reopen retains node identity, resources, and journal.
   2. A different aggregate ID refuses ordinary reopen and explicit reset before any table or row mutation. A changed declaration for the same aggregate requires explicit reset; that reset rebuilds compatible storage atomically.
   3. Unsupported nonempty framework storage refuses even with reset. Current-schema reset rotates `nodeId`, rejects a saved attachment/old-ID command before mutation, and permits the fresh attachment.
2. Reuse the existing disposable React Initializer and native refusal probes after routing them to current modules. React checks semantic fixed-input equality, the renamed changed-input failure, and committed credential refresh without owner replacement. Native checks cloned/validated inputs before file acquisition and a current-schema fresh/reopen/refusal cycle. Do not create additional fixture files or configuration under this plan.
3. The current core/browser/React/native projects have no checked-in runtime test suite or test task for these behaviors. `scripts/verify-plan140.mjs` checks standalone command execution but does not establish storage attachment/reopen/reset ownership. Historical Plan 053 test counts are not evidence about the current graph.
4. Add the explicitly authorized `scripts/verify-session-identity.mjs`, with the minimal storage/identity setup contained in that file and existing dependencies. Adapt the useful cases from the existing disposable standalone reset probes to the current Effect contract API; do not depend on their older checkout or temporary lifetime. Run `node scripts/verify-session-identity.mjs` after its current library dependencies are built. Add no framework, Nx task, test configuration, or second check file.
5. Use one explicit Nx graph for core/browser/React/native/system-worker libraries and applicable real TypeScript/lint tasks. Current project names are `@zerospin/core`, `@zerospin/browser`, `@zerospin/react`, `@zerospin/native`, and `system-worker`. Native's real compiler task is `ts`; its `tsc:typecheck` prints a disabled message and does not count. Resolve the final task set before running it and preserve dependency scheduling/cache behavior.
6. Run scoped formatting and `git diff --check`. Check every new/renamed/deleted source path and current documentation link. Search for removed domain symbols/error spellings in the affected first-party tree, while allowing the explicitly preserved Cloudflare, SQL, lexical, and row-field mapping uses.

## Post-implementation records

1. Update the existing glossary to the implemented direct-declaration, input, owner-identity, and storage-ownership facts. Delete the obsolete `{ contract }` binding definition. No glossary change occurs while writing this plan.
2. Reconcile ADR 004's wording with Node-owned metadata while retaining its governing owner/declaration/reset invariants. Create a successor ADR only if the implemented result changes a governing decision and meets all three criteria: hard to reverse, surprising without context, and a real trade-off. Do not create an ADR for these proposed routine names or merely because the schema version changed.
3. Update the source-linked architecture workflows against finished code, including sequence annotations, Trigger steps, source ranges and hashes. Do not rewrite historical plans or generated indexes to imply this cleanup existed earlier.

## Resolved discussion

1. The user approved including one saved automated storage/identity/reset check after discussing why temporary probes do not provide repeatable repository verification. This settles AGENTS.md's requirement for explicit authorization of that one new check file. No material design or verification choice remains open.

## Phase verification evidence

1. Phase 1 completed on 2026-10-12. The actual parent is `main` at `89b56b272c`.
   1. `pnpm nx run-many -t ts lint --projects=@zerospin/react,@zerospin/native --parallel=3` passed 15 tasks, including library dependencies. In the fresh worktree, native bundling initially ran before machine output existed; `pnpm nx run @zerospin/machine:lib` supplied that unchanged dependency, and the graph then passed. Nx Cloud's existing access code 401 did not block local checks.
   2. The existing React Initializer probe, routed to this worktree's emitted modules, passed fixed-input equality/refusal and latest committed credential-provider behavior.
   3. Existing native probes ran current production `makeNativeSession` with Swift/JavaScriptCore/SQLite offline. Cloned configuration and invalid claims/aggregate selection were checked before file acquisition; the production-seeded Node baseline and fresh replica reopened with identical normalized schema, rows, and versions. Corrupted Node identity, replica claims, and actor version refused without mutation; all file handles and the directory lease were released. Evidence is in `/tmp/zerospin-framework-goal-data-core-UAv4C2/native-plan143-production.log` and `native-plan143-refusals.log`.
   4. Scoped formatting, source metadata refresh, old-name searches and `git diff --check` passed. No new test/fixture/runner files were introduced in this phase.

2. Initial Phase 2 verification completed on 2026-10-12 after integration on `codex/143-session-inputs`; these checks describe the separately delivered PR 52.
   1. `pnpm nx run-many -t lib ts lint --projects=@zerospin/core,@zerospin/browser,system-worker --parallel=3` passed the actual stacked compiler/library/lint graph. The first isolated preflight caught two explicit excess admission fields; both callers were narrowed before the integrated graph passed.
   2. `node scripts/verify-plan140.mjs` passed the existing seven production contract/SQLite/continuation scenario groups after the execution-resolution renames.
   3. Scoped formatting, old-name searches, changed-source architecture hashes/ranges and `git diff --check` passed. The owner/actor/contract selection, transaction behavior and authored agent field maps are unchanged.

3. Initial Phase 3 verification completed on 2026-10-12 after integration on `codex/143-execution-declarations`, before the requested independent rebase.
   1. `pnpm nx run-many -t lib ts lint --projects=@zerospin/core,@zerospin/browser,@zerospin/react,@zerospin/native,system-worker --parallel=3` passed 21 tasks for the actual full stack. Disabled native `tsc:typecheck` was not used.
   2. `node scripts/verify-session-identity.mjs` passed three production Node/SQLite groups: fresh metadata and unchanged reopen; owner/old-schema refusal before writes and atomic same-owner declaration replacement including rollback; warm reset and saved-capability/old-ID command fencing.
   3. Current native production probes reran with a new empty owned directory and a production-seeded schema-13 Node baseline. The actual Swift/JavaScriptCore/SQLite path passed cloned input and zero-open invalid-input refusal, fresh replica creation, exact same-identity reopen, version-12 refusal, and aggregate-ID/session-key/replica-claims/actor-version mismatch refusal without mutation. All handles and directory leases closed. Native replica schema remains 2. Evidence is in `/tmp/zerospin-framework-goal-data-core-UAv4C2/native-plan143-final-production.log` and `native-plan143-final-refusals.log`.
   4. An independent read-only review found no storage ordering, rollback or attachment-fencing issue. Current workflow/ADR/README/glossary records were reconciled; scoped formatting, source metadata, links, old-name searches and diff checks passed.

## Implemented outcome

1. Native procedures consume explicit validated inputs; the shared bundle/type is gone. React owns `initialInputs` and preserves committed credential refresh.
2. Execution procedures resolve direct contract/implementation/identity facts. The obsolete wrapper type and frontend pattern are deleted; current errors, callers, source-linked workflows, glossary and TODOs use the implemented terms.
3. Aggregate Node metadata owns the aggregate ID and the existing declaration key. Schema 13 enforces version and same-owner validation before destructive replacement. The standalone sidecar and provisioning callback are gone. Shared service-node storage and native replica version 2 are unchanged.
4. The single approved saved check verifies real SQLite refusal-before-write, atomic replacement/rollback and reset fencing. Current React and native seams and the existing contract runtime check also passed.
5. Published and attached the complete set of phases: [phase 1, PR 51](https://github.com/morgs32/zerospin/pull/51), [phase 2, PR 52](https://github.com/morgs32/zerospin/pull/52), and [phase 3, PR 53](https://github.com/morgs32/zerospin/pull/53). PRs 51 and 52 are merged into `main`. PR 53 has `main` as its base and contains only its phase changes. Merging PR 53 is outside this request.
6. Changed aggregate Node storage requires empty affected files; no deprecated-row preservation, compatibility alias, sidecar decoder, or migration path was introduced. Unrelated original-checkout work was preserved.

## Remote-main rebase verification

1. On 2026-10-12, fetched remote `main` at `262fcb4f97`, which contains squash-merged PR 51. Replayed only Phase 2 commits for PR 52 and only Phase 3 commits for PR 53. Preserved recovery refs before rewriting and retained all phase-specific source changes.
2. At that first rebase, PR 52's source tree was identical to its previously verified tree and PR 53 excluded Phase 2 source changes. An independent source review confirmed that its Node/worker/runtime-check interfaces have no dependency on Phase 2's renamed APIs.
3. PR 53's independent compiler/library/lint graph passed for core, browser, React, native and system-worker. Its saved production SQLite/Node identity check passed all three groups on the new base. Shared planning records were the only rebase conflict; they retain prior Phase 2 verification as evidence for that separate PR.
4. After PR 52 merged, rebased PR 53 onto remote `main` at `202174308f`. Its storage implementation patch is unchanged; the plan completion record was the only conflict. The combined compiler/library/lint graph passed 21 tasks and `node scripts/verify-session-identity.mjs` passed all three groups. The current glossary and authored-system workflow retain both phases' documentation changes.

## Remaining work

None.
