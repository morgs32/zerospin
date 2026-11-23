# Complete the `.explorer.ts` profiler

## Summary

System injection is complete. The remaining work is the reusable catalogue, telemetry capture, and admission scenarios.

The pilot exports a lazy `explorer` definition. An explicit command executes it and generates a lookup map:

```text
method → outcome → named scenario → { result, telemetry }
```

Imports do not execute scenarios. `/explorer` rendering follows later.

## Implementation

1. **Preserve admission’s inferred errors.** Remove its broad `IAnyError` annotation. In `checkAdmission`, decode the contract version already selected by `getVersion`, preserving existing validation and literal error codes. This produces **21 failure codes plus success**, without advertising unreachable adaptation errors.

2. **Replace the unused core profiler with `makeExplorer` and `runExplorer`.** Infer arguments, success, errors, and required services directly from the supplied method:

   ```ts
   export const explorer = makeExplorer(admitAggregateCommands)({
     errorChannel: 'codes',
     scenarios: {
       success: [
         /* named cases */
       ],
       'admission-contract-not-found': [
         /* named cases */
       ],
       // Every other inferred code is required.
     },
   });
   ```

   Require a nonempty scenario array for every group. Reject missing or additional groups, incorrect arguments, and incomplete service provision. Accept only required, finite literal `code` fields throughout the error union; reject broad, optional, uncoded, `any`, and `unknown` errors. Error-free methods remain eligible. Reserve `success` for the successful outcome.

3. **Capture through the existing logger pipeline.** Extend its bounded argument/result snapshots to include failed exits. Record invocation order and invocation/definition source references. Execute with `runPromiseExit`, retaining the distinction between domain failures, defects, and interruption. Reuse the existing telemetry format, tree builder, and stable trace renderer.

4. **Annotate the pilot’s five existing named spans.** Cover admission, `checkAdmission`, `getVersion`, actor-version resolution, and the admission transaction. Forward `getVersion`’s captured arguments explicitly. Add an optional, type-preserving annotation parameter:

   ```ts
   makeTx(name)(program, annotateFunctionSpan);
   ```

   Preserve synchronous transaction restrictions and capture the authored transaction declaration location. Add no transaction wrapper span.

5. **Create the admission catalogue with isolated real fixtures.** Each scenario arranges typed arguments, fresh SQL.js/Drizzle storage, and a `System` layer. Cover every inferred failure code and successful system, actor, agent, continuation, duplicate, and ordered-batch paths. Include actual transaction failures and rollback. Label malformed configuration/storage fixtures clearly. Keep multiple paths sharing a code as named scenarios and list those shared-code origins for review.

6. **Add `pnpm nx run system-worker:explorer`.** Build dependencies first, keep the source-loading environment alive throughout execution, and enable source maps. Write JSON to `packages/system-worker/dist/explorer/profiles.json`, with an optional output override. Wrong outcomes, fixture failures, defects, and interruption fail the command instead of satisfying coverage.

## Planned changes

`+` creates; `~` modifies or replaces.

```text
zerospin/
  packages/core/
    src/profiler/                         ~ replace unused implementation
    src/drizzle/make/makeTx.ts            ~ optional annotation
    src/contracts/getVersion.ts          ~ capture arguments
    src/aggregateActor/
      getAggregateActorVersion.ts        ~ capture arguments
    scripts/run-explorers.mjs             +
    test/explorer.node.spec.mjs           +
  packages/logger/src/                   ~ exits, sources, ordering
  packages/system-worker/
    src/checkAdmission.ts                ~ precise decoding
    src/AggregateChain/admitAggregateCommands/
      admitAggregateCommands.ts          ~ inference and annotation
      admitAggregateCommandsTx.ts        ~ enable annotation
      admitAggregateCommands.explorer.ts +
    project.json                         ~ explicit command
```

After implementation, document the codes-only convention locally, reconcile terminology, and archive the completed implementation plan.

## Verification and defaults

1. Compiler checks prove exhaustive groups, strict coded-error eligibility, typed arguments/services, and unchanged transaction restrictions.
2. Execute all 22 admission groups. Verify retained duplicates and atomic rollback using real storage.
3. Check successful and failed span snapshots, parentage, tied-time invocation ordering, and authored TypeScript locations.
4. Verify imports perform no execution and the command produces readable JSON without global configuration hooks.
5. Run scoped Nx builds, typechecks, lint, core Node tests, and affected admission/authorization checks.

“Every result” means every declared outcome group, supplemented by explicitly authored path scenarios. The profile captures the awaited named Effect span tree; ordinary JavaScript and SQL operations remain inside those spans.

## Implemented shared-code origins

The pilot contains 22 groups and 60 named scenarios. These codes cover distinct
source branches; other failure groups originate from one semantic branch.
Malformed configuration and storage cases are explicitly named in the catalogue.

| Code                                      | Shared origins                                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `public-async-command-forbidden`          | Untrusted response intake; owner external public submission; actor external validation in `checkAdmission`.                  |
| `aggregate-chain-target-mismatch`         | Bound aggregate ID or aggregate name mismatch.                                                                               |
| `aggregate-command-source-unavailable`    | Missing authored aggregate release or different system name.                                                                 |
| `external-contract-kind-mismatch`         | Continuation with absent, ordinary, or wrong-owner contract; continuation contract version mismatch.                         |
| `actor-version-invalid`                   | Ordinary actor absence/version mismatch; historical resolver's unsupported actor and conflicting actor declaration failures. |
| `administrative-contract-claims-required` | Ordinary owner claims; mapped original contract claims; non-actor continuation claims.                                       |
| `administrative-contract-unavailable`     | Missing owner contract or wrong owner kind.                                                                                  |
| `administrative-agent-binding-invalid`    | Agent absence; aggregate name, aggregate version, or session name mismatch.                                                  |
| `administrative-agent-contract-forbidden` | Missing agent contract binding; different canonical contract object; submitted version mismatch.                             |
| `decode-command-payload-failed`           | JSON syntax or submitted-version payload schema failure, including late batch validation.                                    |
| `node-admission-identity-mismatch`        | Retained duplicate identity mismatch or previous node submission identity mismatch.                                          |
| `node-admission-index-mismatch`           | Invalid first node position or later position gap.                                                                           |
| `aggregate-admission-failed`              | Uncoded table encode/decode failures; actual SQL transaction begin/insertion failures; malformed retained or staging data.   |

## Completed implementation and verification

1. Replaced the unused profiler and its core instrumentation dependencies with
   lazy `makeExplorer` catalogues and `runExplorer`. Compiler checks reject
   missing/additional or empty groups, incorrect arguments, incomplete service
   provision, and broad/optional/uncoded/any/unknown/infinite-template errors;
   error-free methods remain eligible and `success` is reserved.
2. Admission retains precisely 21 failure codes plus success. Its 60 isolated
   real SQL.js scenarios cover authority, submitted version selection without
   adaptation, duplicates, ordered batches, malformed configuration/storage,
   actual transaction failures, and atomic rollback.
3. Existing logger telemetry captures bounded arguments and success/failure
   exits, invocation order, and authored definition/invocation references. All
   five pilot spans retain their parentage and TypeScript locations; annotated
   transactions add no wrapper span and preserve synchronous restrictions.
4. `pnpm nx run system-worker:explorer` writes readable profiles to the default
   output. The source loader stays alive through fixture completion. Fresh-process
   import checks prove no fixture arrangement occurs during catalogue imports.
   Wrong outcomes, fixture failures, defects, and interruption fail execution.
   Runner regressions cover exceptional domain-code collisions, detached roots,
   prototype property names, and output filenames containing equals signs.
5. The complete scoped Nx graph passed `lib`, `ts`, `lint`, `test:node`,
   `explorer:check`, `aggregate-administration:check`, and
   `authorization-provisioning:check` for core, logger, and system-worker with
   required dependencies. Core passed 46 Node tests; logger passed 7. The artifact
   checker passed all 22 groups and 60 scenarios. Evidence:
   `/tmp/zerospin-explorer-verification-complete.log`.
6. The real Workerd RPC check exposed null-prototype snapshot objects that JSON
   schema validation preserved unchanged. Snapshots now use ordinary objects
   while preserving own `__proto__` data safely. The Workerd check and snapshot
   prototype regression pass after that correction.
7. Nx output override forwarding passed with
   `--output=/tmp/zerospin-explorer-override=profiles.json`. Scoped formatting and
   `git diff --check` passed. Existing unrelated curly lint warnings remain;
   Nx Cloud remote cache access returned 401, while all local gates passed.
8. Documented the codes-only convention in
   [the local pattern](../../patterns/testing/codes-only-explorers.md), reconciled
   catalogue/profile terminology in the glossary, and archived this completed
   implementation plan. No new ADR was warranted for these reversible API and
   diagnostic changes.

9. Integrated the current command-finalization schema while preserving all 60
   scenarios, strict immutable duplicate identity, and the five pilot spans.
   The combined Nx graph passed for core, logger, browser, and system-worker:
   52 core, 7 logger, and 68 browser Node tests, all 22 explorer groups,
   and both Workerd checks. The browser regression verifies terminal agent
   admission rejection, atomic optimistic cleanup and rollback, submission
   position reuse, and continued delivery on the same connection. Evidence:
   `/tmp/zerospin-pr42-integrated-verification.log`.

## Remaining work

None.
