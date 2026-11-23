# Resolve decoded command input once

**Date:** 2026-10-15

**Status:** Complete on 2026-10-15. Implementation, current documentation and required verification passed.

**Related:** [source contract and execution contract](../../glossary.md#execution-contract), [ADR 008](../../adrs/008-ordinary-and-recorded-continuation-authority.md), [ADR 012](../../adrs/012-opaque-external-work-and-originating-chain-continuations.md), [ADR 014](../../adrs/014-synchronous-original-finalization.md).

## Problem and evidence

1. `resolveAggregateExecution` and `resolveServiceExecution` decode external command input with `sourceContract`, discard the decoded result, and return the parsed portable JSON as `decodedPayload`. Their evaluators then call the concrete external invocation preparation method, decoding the same JSON with the executing public declaration. The property name hides that external input is still encoded.
2. When both declarations are the same canonical object, the second conversion repeats the first. A response-codec counter demonstrated two decodes, including when another release reuses that same declaration. Moving already decoded values through the existing preparation methods is incorrect: Date codecs reject decoded Dates as wire input, and transformation codecs apply their transformation again.
3. When declarations differ, the two checks serve separate responsibilities. The exact historical declaration validates the retained format; the executing declaration interprets the original portable input for its program. Existing Service acceptance checks reject an invalid historical response even when the executing response schema is `Schema.Unknown`. Removing historical validation would erase that guarantee.
4. Checked `contract.evaluate` validates decoded argument types with `Schema.toType`. It does not repeat wire conversion and remains necessary for callers that invoke it independently of either VersionRepo.

## Approved behavior

1. Each execution resolver owns the complete prepared invocation for its executing declaration. Return the existing execution entry and actor together with explicit historical actor claims and the prepared invocation:

   ```ts
   const execution = { executionContract, actor, actorClaims, invocation };
   ```

   Reuse the concrete preparation methods and their existing `IPreparedInvocation` types or inferred return types. Remove the resolver result's `decodedPayload` field outright. Introduce no decoded-state flag, proof token, cache, compatibility shape or forwarding-only helper.

2. Preserve current owner, contract-family, exact historical declaration, actor, actor-exposure and ordinary lineage checks in their existing meaningful order. Resolve the public declaration with `publicContract(executionContract)` so server adapters retain their current evaluation and result-codec ownership.
3. For an external command, parse its frozen payload once into portable JSON. Compare `sourceContract` with the executing public declaration by canonical object identity. System construction already rejects conflicting public declaration objects for the same owner/command name/version; release identity is not the comparison.
4. If the declarations differ, first call `decodeExternalCommandInput` with the historical declaration to validate frozen payload and retained `externalOutcome`. Discard that decoded value deliberately. Then call `prepareAggregateExternalInvocation` or `prepareServiceExternalInvocation` with the executing declaration, original portable payload, retained observation and actor claims.
5. If the declarations are identical, call only the concrete external preparation method. Its existing `decodeExternalCommandInput` call performs the single wire conversion and returns the invocation consumed by guards and evaluation. Reusing a canonical declaration in another release receives the same treatment.
6. For ordinary commands, preserve `decodeAndAdaptPayload` and authored previous/next lineage behavior. Move the existing ordinary invocation preparation into resolution so both branches return `invocation`. Do not redesign ordinary adaptation or remove its decoded-type validation.
7. Evaluators consume `invocation` directly. They retain owner/actor guards, read-database construction, checked evaluation and result encoding. The historical `actorClaims` still go to `validateAggregateCommand` or `validateServiceCommand`; the contract's prepared `invocation.claims` still go to its guard and program. Contract claim preparation may narrow fields or supply null, so these values must not be collapsed.
8. Keep `decodeExternalCommandInput` as the shared codec boundary and retain the decoded-argument validation inside `constructContractVersion`. No source response upgrade/adaptation is added: differing declarations continue to interpret the original portable observation independently.

## Failure and transaction requirements

1. Input preparation remains inside the existing business savepoint and synchronous execution boundary. Keep codec Context isolation, current error codes, full Cause propagation and interruption handling. No external request runs during resolution or evaluation.
2. Malformed historical or executing input remains an infrastructure failure. In particular, do not add `external-payload-invalid`, `external-outcome-invalid` or `external-response-invalid` to retained command Failure allowlists. Such failures roll back resource changes and leave `materializationHead` and publication rows unchanged.
3. Preserve retained refusals for unsupported executing declarations, existing ordinary adaptation failures, synchronous-program violations and authored business failures according to each existing execution parent's policy. This refactor does not unify the Aggregate and Service failure allowlists.
4. Moving preparation earlier must preserve business-failure encoding ownership. Current preparation failures are framework validation errors; authored guards and programs still run only after the resolver has returned and `executeAggregateCommandTx` or `executeServiceOccurrence` has captured `executionContract`. Keep that assignment before evaluation and do not move authored callbacks into resolution.
5. Admission, original execution commit, replay, dispatch acknowledgement and `outcome` retention keep their current ownership. No durable schema, command shape, `outcome: { result, finalizedAt }` shape or external observation format changes.

## Implementation sequence

1. Recheck the four resolver/evaluator files and their direct consumers against concurrent WIP. Preserve unrelated changes. Use the existing concrete preparation functions; keep resolver methods readable as declaration resolution, historical validation and invocation preparation.
2. Update both resolvers to return `actorClaims` and `invocation`. Preserve ordinary adaptation. Apply the canonical-identity condition only to the otherwise redundant external historical decode; always prepare the executing invocation from the original portable values.
3. Update both evaluators to use the resolved invocation and historical actor claims. Delete their preparation branches, imports and obsolete local fields. Preserve the admitted command parameter where it supplies Origin for actor-visible reads and Service guards.
4. Update direct resolver-result assertions in the existing `scripts/verify-plan140.mjs` acceptance scenarios. Extend those scenarios with the smallest meaningful decoding and rejection checks below. Add no test files, fixture files, runners or configuration.
5. After implementation, reconcile the AggregateVersionRepo, ServiceVersionRepo and contract READMEs with the actual boundary. Clarify the existing glossary entries for source contract, execution contract and invocation arguments where needed. Do not introduce a new domain concept for this internal result shape. Create an ADR only if implementation reveals a qualifying hard-to-reverse decision involving a real trade-off; this routine ownership cleanup does not currently warrant one.
6. Run scoped verification, record results and resolve in-scope failures. Archive this same plan only when implementation, documentation and all required checks pass; preserve the filename and repair affected links.

## Planned files

`+` creates a file; `~` modifies an existing file. Only this plan is created during planning. Existing core preparation methods and execution parents are reused and reviewed; no source change to them is currently required.

```text
zerospin/
  wiki/
    plans/
      + 205-plan-external-command-input-resolution.md
    ~ glossary.md
  packages/system-worker/src/
    AggregateVersionRepo/
      ~ README.md
      utils/
        ~ resolveAggregateExecution.ts
        ~ evaluateAggregateCommand.ts
    ServiceVersionRepo/
      ~ README.md
      utils/
        ~ resolveServiceExecution.ts
        ~ evaluateServiceCommand.ts
  packages/core/src/contracts/
    ~ README.md
  scripts/
    ~ verify-plan140.mjs
```

## Verification

1. Extend the existing Aggregate and Service execution-resolution scenarios to prove one wire conversion per codec when source and executing public declarations are identical, including reuse across releases. Use a counting transformation or equivalent observable decoded value; assert the prepared invocation reaches guards/programs without a second transformation. Retain coverage that Date payloads reach evaluation as Dates.
2. Preserve the existing differing-declaration Service case: a malformed historical response must fail even when the executing schema accepts `Schema.Unknown`. Add the complementary assertion that the executing invocation receives its own interpretation of the original portable response, rather than historical decoded output.
3. Use the existing execution/savepoint seam to prove that a valid historical observation rejected by the executing codec remains an infrastructure failure with no resource, materialization-head or publication advancement. Preserve existing original/replay guards, historical actor claims versus contract claims, ordinary bidirectional adaptation and direct checked-evaluation checks. Cover both external observation branches without creating an exhaustive matrix.
4. After refreshing relevant Nx configuration if necessary, run one scoped dependency graph:

   ```sh
   pnpm nx run-many -t lib ts lint test-workerd-ts test-workerd -p @zerospin/core system-worker --nxBail
   ```

   Let dependencies and caching work normally; do not overlap build writers. Then run existing `node scripts/verify-plan140.mjs` against current artifacts. Save verbose logs outside the repository. Do not run Explorer verification.

5. Check formatting, whitespace and links for changed files, plus direct references to the removed resolver-result field. Existing local variables named `decodedPayload` elsewhere are outside this cleanup. No runtime checks are needed merely to write this plan.

## Alternatives and scope

1. Removing historical validation globally would allow malformed retained input to pass through a more permissive executing schema. Keep it when declarations differ.
2. Passing historically decoded data into another wire decoder either rejects legitimate Date values or transforms values twice. Preparing execution from the original portable data preserves current cross-version semantics.
3. An `alreadyDecoded` option or parallel prepared/unprepared execution path would make callers coordinate input state. The resolver instead returns one existing invocation representation, and evaluators consume it directly.
4. Request execution, response encoding/retention, queue delivery, fanout, history storage and response-version migration are outside scope. This plan changes no fixed schema and needs no storage reset. Add no aliases, fallback decoders or compatibility-only checks.

## Verified result

1. `resolveAggregateExecution` and `resolveServiceExecution` now return `executionContract`, the retained actor, historical `actorClaims` and a prepared `invocation`. Ordinary adaptation and concrete invocation preparation remain intact. External input uses one wire decode when historical and executing public declarations are the same canonical object; different declarations validate historical input before preparing execution from the original portable values.
2. Both evaluators consume the resolved invocation directly. Their repeated preparation branches and obsolete result fields are removed, along with the redundant nested generator in `evaluateAggregateCommand`. Release/actor guards retain historical actor claims; contract guards and programs receive prepared contract claims. Existing shared codecs, checked-evaluation type validation, server adapters, business-failure encoding and synchronous savepoint ownership remain intact.
3. Existing acceptance scenarios prove single response conversion for Aggregate and Service, canonical Aggregate declaration reuse across releases, Date payload preparation, unchanged historical-format rejection, independent executing interpretation, handling of a failed external request, and an incompatible executing codec committing no resource, materialization-head or publication progress. A contract claims schema narrows claims while the existing actor guard still receives historical fields. No test, fixture, runner or configuration file was created.
4. The final `pnpm nx run-many -t lib ts lint test-workerd-ts test-workerd -p @zerospin/core system-worker --nxBail` passed all **10 tasks**, including **27 Workerd tests across 6 files**. Lint reported zero errors and 13 existing brace-style warnings; the two new import-order warnings from the first pass were corrected. Nx Cloud's access 401 was ancillary to successful local execution. Log: `/tmp/plan205-quality-final.log`.
5. Existing `node scripts/verify-plan140.mjs` passed all **13 contract acceptance groups** against the final artifacts. Log: `/tmp/plan205-plan140-final.log`. The earlier Workerd pass encountered a concurrent subscriber-schema/test edit referring to removed `currentIndex`; the independently updated shared-worktree assertion passed on the final run. Plan 205 did not modify subscriber code or tests.
6. AggregateVersionRepo, ServiceVersionRepo and contract READMEs, plus the existing glossary entries, describe the implemented invocation and decoding boundary. No new ADR was warranted. Scoped formatting, whitespace, script syntax and changed documentation links passed. Source review confirmed the obsolete resolver result fields are absent and failure allowlists remain unchanged.
7. No durable schema, admitted command protocol, request scheduling or external observation shape changed. No storage reset, compatibility path, provider request, commit, publication or deployment was performed. Concurrent WIP was preserved; Explorer verification was not run.

## Remaining work

None.
