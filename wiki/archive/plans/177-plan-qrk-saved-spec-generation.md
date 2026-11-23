# QRK saved spec generation through session-owned work

**Date:** 2026-10-15
**Status:** Implemented and verified under the user-clarified UI-only scope.
**Owner repository:** `qrk.sh`
**Parent:** [Command/query UI cleanup](160-plan-command-query-ui-cleanup.md)
**Related:** [168](168-plan-qrk-synchronous-brick-saves.md), [184](184-plan-qrk-library-backend-ownership.md)

## Implemented behavior

1. Saved generation synchronously stages `generateBrickSpec` and records the placement's request identity, prompt, state/spec revisions, and generating status in the same local transaction. The form keeps its unsaved prompt and presents immediate staging refusal through its existing command-error output; progress, provider errors and retry come from that placement's live query.
2. `startBrickSpecGeneration`, composed into the existing Library/Studio editing-session owner, calls the existing API generator outside the model transaction. A request captures the current module/state/spec baseline, uses a per-request browser lock, and discards results after session replacement or disposal. This is local session-owned execution, not a new backend durability guarantee.
3. `completeBrickSpecGeneration` checks current request, module, brick revision, placement revision and generating status. It validates the generated spec against that module's component schema and root before atomically updating spec, revision, measurement invalidation and ready status. Provider/invalid-output failure preserves the existing spec and records a safe retryable error.
4. Manual spec saves and brick-state changes supersede active generation in the same transaction. A newer request, changed state/spec, removed row, different module or duplicate completion cannot overwrite newer content or add a second spec revision.
5. The module page's unsaved preview generation and actual browser measurement remain with their existing owners. No backend Library owner, generic job table, test file, fixture or runner was introduced.

## Source

1. `apps/library/libraryModule/contracts/makeBrickSpecGenerationContracts.ts` owns request/completion programs.
2. `apps/library/session/startBrickSpecGeneration.ts` owns provider execution and disposal.
3. `apps/library/libraryModule/models/placement/placementModelV1.ts` owns typed generation metadata and `specRevision`; the brick model owns `stateRevision`.
4. `apps/library/make/makeModuleSpecContractVersion.ts`, raw brick updates and module configuration/completion writers invalidate stale generation.
5. `apps/library/app/bricks/[brickId]/admin/page.tsx` renders the query and stages generation synchronously.

## Verification

1. Existing Nx Library reusable build, Library Next app build, Studio Next app build and API Worker dry-run build passed in the consolidated graph (`/tmp/qrk-plan160-verified-builds.log`). The final Library app build also passed after immediate-refusal presentation was corrected (`/tmp/qrk-plan177-final-app.log`).
2. Source review traced transaction/revision checks, malformed generated spec handling, disposal and replacement fences and unchanged preview/provider boundaries. No real OpenAI request or charge was performed. Provider behavior is not claimed as exercised.
3. The user explicitly chose local execution rather than backend durability. Closing the editor preserves intent while the editing session remains owned; closing that owner releases its RPC references and fences late writes. The existing HTTP batch transport does not guarantee cancellation of already-sent HTTP/provider work. Reload can resume locally retained generating intent under the same documented request/revision guards.

## Remaining work

None.
