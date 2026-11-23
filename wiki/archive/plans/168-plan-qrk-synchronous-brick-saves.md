# QRK synchronous brick saves and queried state

**Date:** 2026-10-15  
**Status:** Complete; scoped builds and source review passed.  
**Owner repository:** `qrk.sh`  
**Parent:** [command/query UI cleanup](160-plan-command-query-ui-cleanup.md)  
**Ownership:** [local editing-session work](184-plan-qrk-library-backend-ownership.md)

## Implemented outcome

1. [`useUpdateBrick`](../../../../qrk.sh/apps/library/lib/useUpdateBrick.tsx)
   stages ordinary `updateBrick` synchronously and returns its original local
   `IResult`. SWRMutation, its keys/revalidation/status and Promise-only wrapper
   are removed. The shared module form save callback is synchronous.
2. Library brick/admin pages and Studio detail render their saved state from
   the live brick query. `acceptedState`, equality-clearing effects and optimistic
   presentation copies are removed. Only unsaved drafts remain; direct staging
   refusal keeps the draft and successful staging clears it.
3. Image upload, editor/navigation cleanup and actual DOM measurement retain
   their genuine browser lifetimes. Raw Figma JSON admin saves use the separate
   `measureAndUpdateBrick` path, which captures all four placements, cancels on
   close/switch/reset, compares the current same-brick state and every spec, then
   stages without an intervening await. Ordinary form saves have no such wait.
4. The dependent module work adds integer `brick.stateRevision` and
   `placement.specRevision`, both initially zero. Raw state changes, module
   configuration and completion increment the state revision. Manual/generated
   spec changes increment the spec revision. State/spec changes invalidate
   measurements and supersede active saved-spec generation in the same transaction.
5. Figma provider configuration stages intent immediately. Its independent
   ready-state DOM render measures all four breakpoints and a revision-guarded
   measurement command writes their rounded, unconstrained dimensions atomically.
6. Owner-level session subscriptions present later Library command refusals.
   Optimistic acceptance and authoritative rollback remain visible through the
   same query. The isolated Library backup namespace preserves previous data.

```ts
// 1. Stage an ordinary save in the local transaction.
const result = updateBrick(parsedDraft);
// 2. A refusal keeps the unsaved draft.
if (result._tag === "Failure") showInputFailure(result.failure);
// 3. Successful staging discards only the unsaved input.
else clearDraft();
// 4. Saved presentation is the queried brick, including optimistic rollback.
render(brick.state);
```

## Verification

Final evidence: `pnpm nx run-many -t build:app,build -p
@qrk.sh/library,@qrk.sh/studio,@qrk.sh/api` passed all four tasks.
The subsequent `@qrk.sh/library:build` passed after adding explicit state/spec
revision comparisons to the genuine pre-save measurement baseline.

Library reusable/app, Studio app and API Worker dry-run builds passed. The final scoped
rerun passed after owner notification and search traversal updates. Source review
confirms no accepted-state shadows, direct-save SWR or awaited ordinary save. No
new tests, fixtures, runners, backend integration suite or storage reset was added.

## Remaining work

None.
