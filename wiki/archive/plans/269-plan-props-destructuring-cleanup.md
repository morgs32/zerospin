# Props destructuring cleanup

**Status:** Completed and verified, 2026-10-26, on merged `main` at `569ff979ac56c99058346c8a87b7aad37b3a6047` ([props cleanup PR #72](https://github.com/morgs32/zerospin/pull/72)).

The original stack depended on [Actor spec PR #71](https://github.com/morgs32/zerospin/pull/71), whose Service-time test blocked verification. Its authorized test-only correction has merged: original evaluation submits `observeTime@2` to Release 2, while replay retains the admitted `observeTime@1` command and evaluates it through Release 2's upgrade adapter. Production admission behavior is unchanged. The full suite now passes on the merged combination.

## Problem and scope

1. Authored functions still mix local bindings with repeated `props.*` reads, forward entire bags after partially destructuring them, or wait until nested Effect bodies to establish their inputs. This obscures which inputs a method actually uses and conflicts with the existing [local convention](../../patterns/typescript/no-props-after-destructure.ts).
2. Clean up function, method, constructor and callback input handling in authored `packages/*/src/**/*.ts` and `.tsx`, with a matching scan of `examples/*/src`. Work module by module rather than applying a repository-wide text replacement. Preserve behavior, public signatures, inference, validation and execution timing.
3. A planning-time text scan found 154 candidate files. A narrower TypeScript syntax scan found direct accesses to an identifier parameter named `props` in **162 functions across 144 files**: Core 55 files, System Worker 54, Browser 20, Machine 6, CLI 2, Error 2, Native 2, React 2 and Studio 1. These are review candidates, not 162 proven violations. The same scan found no matching Example source functions. Refresh the inventory when implementation starts; also inspect whole-bag forwarding and parameter destructuring that this direct-access count does not detect.
4. Exclude `explorer/`, dependencies, vendored/generated code, declaration files, built outputs, framework-owned `this.props`, and convention examples under `wiki/patterns`. Do not sweep tests, fixtures, stories or configuration for style. Existing callers outside source directories may change only if necessary to preserve compilation or existing behavior.
5. Keep [Plan 267](267-plan-aggregate-chain-registration.md), Actor `.spec`, Agent prerequisites, spec acceptance and permission/admission design outside this work. Registration behavior has changed since Plan 263; preserve the current whole-SystemSpec hash gate from Plan 266 and accommodate any implementation of Plan 267 without reverting it.

## Intended method shape

1. Keep the named props parameter. Establish its fields together at the start of the owning body, then use those local bindings and explicitly named forwarding fields:

   ```ts
   function rebuild(props: {
     resources: readonly IResource[];
     commands: readonly ICommand[];
   }) {
     const { resources, commands } = props;
     return rebuildResources({ resources, commands });
   }
   ```

2. Fold later destructures into the initial one. Use aliases for genuine local-name collisions. Preserve optional-property presence, nullable values, existing fallback expressions and rest-property behavior; destructuring defaults apply only to `undefined` and cannot replace `??` indiscriminately.
3. Preserve validation order. Decode `unknown` input before accessing its fields, then destructure the decoded value. Keep schema input and constructor `super(...)` forwarding at their existing boundaries; do not expand or clone an unvalidated object merely to satisfy a style rule. Preserve canonical instances, property descriptors and identity wherever those are part of the existing contract.
4. Preserve method receivers. A destructured dependency still owns its methods: use `repo.execute(...)`, not a detached `execute(...)`. For a callback called directly as `props.replay(...)`, inspect its declaration, implementation and callers before detaching it. If it depends on the original props receiver, bind it once to that receiver during input setup before destructuring the remaining fields, then use the bound local. This is a narrowly justified input-setup exception to the shared first-line rule, not permission to keep scattered `props.*` reads. Do not add forwarding wrappers, generic receiver bags, casts or callback API changes to force a cosmetic rewrite.
5. Preserve lifetime and laziness. Moving a read from an executing Effect or later asynchronous continuation into an outer factory can change which value is observed. Establish stable configuration inputs in the outer body only when existing ownership/callers support that capture. Keep intentional live reads attached to their actual domain object and preserve their execution phase. Record any necessary exception locally with its concrete reason; aliases that merely hide `props` do not qualify.
6. Preserve each nested parameter scope. A nested function receiving its own `props` establishes its own bindings. Do not hoist its inputs into an enclosing function or confuse React component rest props with class-instance `this.props`.

## Implementation passes

1. Refresh the current diff and candidate inventory using existing search and TypeScript tools without creating a runner or codemod file. Classify each candidate as ordinary data inputs, mixed/late destructuring, callback receiver handling, validation boundary, intentional live reads or an excluded framework construct. Inspect forwarding-only and parameter-destructured methods as well. Reuse this inventory until relevant source changes.
2. Start with the representative Core cases: `models/defineModel.ts` for validation followed by data-field reads, and `Node/rebuildOptimisticResourcesTx.ts` for partial destructuring and the `replay` callback. Keep the synchronous transaction and command replay sequence intact. Continue through the other Core modules in small cohesive passes.
3. Review System Worker next, beginning with `makeFanoutQueue/runFanoutDeliveries.ts` and its `makeFanoutQueue.ts`/storage callers. Preserve source-prefix capture, concurrency, callback receivers, queue scopes, retry scheduling and deferred delivery. Clean the remaining System Worker modules without changing transaction or constructor activation order. Coordinate overlapping registration files with Plan 267.
4. Apply the same review to Browser, Native, Machine, Error, CLI, React and Studio. Preserve abort listeners, notification callbacks, cleanup ownership and React render/lifecycle behavior. Do not turn component or callback cleanup into UI redesign or unrelated naming/type work. The Example scan is an audit; change Example sources only if a real in-scope case is found.
5. Remove superseded duplicate destructures and unnecessary whole-bag forwarding within changed methods. Do not add generic preparation helpers, a new lint rule/plugin, configuration, a persisted scanner or an enforcement framework.
6. Finish with a syntax-aware rescan and manual disposition of every remaining match. Completion means every in-scope candidate has been reviewed and ordinary violations removed; a raw zero-match regex is neither required nor sufficient. Identify concrete receiver/validation/lifetime exceptions rather than silently skipping them.

## Planned file hierarchy

Paths are rooted at `/Users/morgs32/GitHub/zerospin/`. `~` means modify reviewed source files; grouped paths represent the inventory above, not permission to rewrite every file. No production files are created. The plan is the only file created during planning.

```text
packages/
  core/src/
    models/~ defineModel.ts
    Node/~ rebuildOptimisticResourcesTx.ts
    ~ other reviewed props-input methods
  system-worker/src/
    makeFanoutQueue/~ runFanoutDeliveries.ts
    ~ other reviewed props-input methods
  browser/src/~ reviewed props-input methods
  native/src/~ reviewed props-input methods
  machine/src/~ reviewed props-input methods
  error/src/~ reviewed props-input methods
  cli/src/~ reviewed props-input methods
  react/src/~ reviewed props-input methods
  studio/src/~ reviewed props-input methods
examples/*/src/~ only newly identified in-scope cases
wiki/plans/~ 269-plan-props-destructuring-cleanup.md
```

## Verification

1. Review each module pass for equivalent validation, fallback behavior, property presence, callback receivers, effect timing and cleanup. Preserve observable behavior rather than treating successful compilation as proof of receiver correctness. Use existing callback implementations and callers as the primary evidence.
2. Refresh resolved Nx targets once implementation scope is settled. Use one explicit graph for the nine changed package families, with their available `lib,ts,lint` targets and normal dependencies:

   ```sh
   pnpm nx run-many --projects=@zerospin/core,system-worker,@zerospin/browser,@zerospin/native,@zerospin/machine,@zerospin/error,@zerospin/cli,@zerospin/react,@zerospin/studio --targets=lib,ts,lint
   ```

   Confirm the project names and available targets before running; remove packages with no changes and add an actual affected consumer only when the diff requires it. Do not run overlapping graphs that rebuild shared outputs.

3. Reuse the existing test program and runtime suites. After the source passes, run `pnpm nx run zerospin:test -- --maxWorkers=2` once. Use focused existing cases during implementation only when a receiver/lifetime change or failure warrants them. Extend an existing case only when a concrete behavior cannot otherwise be established; do not write tests that mirror each destructure. Create no test files, fixtures, runners or configuration.
4. Run formatting/checks only on changed files, the final candidate disposition review and `git diff --check`. No Explorer checks, deployment, storage reset, publication, browser session or Storybook build are required for this input-handling cleanup. If an edit would require unrelated UI or lifecycle redesign, keep it outside this plan.

## Decisions and completion

1. Prefer module-sized semantic edits over a global replacement because callback receiver and execution phase are observable behavior. Prefer the existing local convention over inventing a second style policy or new tooling.
2. Keep this an input-handling cleanup. Do not use props edits as justification to change declaration ownership, registration operations, persistence schemas, command semantics or public callback contracts.
3. After implementation, reconcile any affected method comments/module guidance and check `wiki/glossary.md` for actual terminology changes. No new domain term is expected, so do not manufacture a glossary entry. Preserve the existing pattern unless a real receiver/lifetime exception needs clarification. Routine destructuring does not warrant an ADR; record one only if a separately agreed implemented decision meets the repository's qualifying criteria.
4. Record the final inventory/dispositions, modified modules and verification results here. Keep the plan active while any required implementation or check remains. Archive it with repaired links only after verified completion. Persistent storage and deployment remain untouched.

## Implementation results

- Updated 142 source files across Core, System Worker, Browser, Native, Machine, Error, CLI, React and Studio. Inputs use local bindings and explicit forwarding; callback setup preserves the original receiver. No public signatures, storage schemas, registration rules or command semantics changed.
- The final TypeScript syntax scan reports no parse errors. Its nine remaining direct `props` property accesses occur in four canonical factory validation paths: Aggregate modules, Service models/contracts, Service Actor contracts and Contract models. Each is guarded access to unknown input before strict decoding. Callback `.bind(props)` setup is retained separately.
- Reviewed complete-request forwarding and existing parameter destructures. Strict decoder boundaries, public facade requests, framework render/rest props and class-held configuration remain intact. Already-destructured leaf callbacks need no rewrite. Example sources contained no matching candidates.
- `modelOperationDescriptors` reads operation inputs inside its existing `Effect.suspend`; the inline comment records why. Browser attachment callbacks preserve both the original direct-call receiver and the separately exposed callback identity. Native abort listeners retain the session signal independently of runtime cancellation.
- Clarified the existing local props pattern and its index keywords for validation boundaries, callback receivers and deferred inputs. The glossary needs no new term, and architecture workflows remain unchanged. No ADR, tests, fixtures, runners or configuration were created.
- The nine-project Nx `lib,ts,lint` graph passed all 34 tasks. A cold Native bundle initially raced unavailable Machine output; the second graph passed after dependency outputs existed, without configuration changes. Two introduced constructor-name shadowing errors were corrected before the successful graph. Existing Core lint import-order warnings remain; no lint errors were reported. Nx Cloud could not upload cache artifacts because its workspace access returned 401; local task results succeeded.
- The initial pre-merge `pnpm nx run zerospin:test -- --maxWorkers=2` compiled the complete test program and ran 164 tests: **163 passed, one failed** across 33 files. The sole failure was the unchanged parent Service-time test (`freezes Service adapters, guards and programs at finalizedAt during original evaluation`), rejected by `checkAdmission` with `Unknown submitted contract observeTime@1`. Release 2 registers only `observeTime@2`. No failure was attributed to this props cleanup; the merged correction and successful rerun are recorded below.
- Final source review found no parser errors or new `ALLOWED_CAST`/`ownerKind` additions. Changed-file formatting and diff checks pass. Persistent storage, deployment and package publication remain untouched.

## Post-merge verification

1. On 2026-10-26, verified merged `main` at `569ff979ac56c99058346c8a87b7aad37b3a6047`, including PR #71's Service-time correction and PR #72's props cleanup.
2. `CI=true pnpm install --frozen-lockfile` passed. The dependency refresh left `package.json`, `pnpm-workspace.yaml` and `pnpm-lock.yaml` unchanged.
3. `NX_NO_CLOUD=true pnpm nx run zerospin:test -- --maxWorkers=2` passed the complete test TypeScript compilation and **164 tests across 33 files**. Nx completed the test target and its 11 dependency tasks; three dependency tasks reused cached output. The runtime suite executed successfully, including both Service-time cases.
4. Closure changed only this plan. No source or test changes were needed, so the previously passing 34 build/type/lint tasks were not repeated. Explorer verification, persistent storage, deployment, publication and the unrelated research WIP remain outside this closure.

## Remaining work

None.
