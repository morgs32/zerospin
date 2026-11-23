# QRK GitHub activity through a command and queried result

**Date:** 2026-10-15  
**Status:** Complete; scoped builds and source review passed.  
**Owner repository:** `qrk.sh`  
**Parent:** [command/query UI cleanup](160-plan-command-query-ui-cleanup.md)  
**Ownership:** [local editing-session execution](184-plan-qrk-library-backend-ownership.md)

## Agreed scope

The user clarified that the goal is removing asynchronous UI ownership; backend
durability is not required. Library remains standalone. Both Library and Studio
run this module's provider work at their existing editing-session lifetime.
The earlier backend-owner/adapters requirement is superseded by that instruction.

## Implemented workflow

1. [GitHubActivityForm](../../../../qrk.sh/apps/library/modules/githubActivity/GitHubActivityForm.tsx)
   retains only an unsaved input and local validation feedback. Save stages
   `configureGithubActivity` synchronously and clears the draft only on success. The
   form reads resolution progress/error from the queried brick. A changed input
   remains editable while resolving; retrying a failure creates a new request ID.
2. [Configuration](../../../../qrk.sh/apps/library/modules/githubActivity/makeConfigureGithubActivityContract.ts)
   validates canonical module input and brick identity, refuses an identical
   resolving request, and records input/request identity, null computed data and
   resolving status. It increments `brick.stateRevision`, invalidates all four
   placement measurements, and supersedes active saved-spec generation atomically.
3. [The module executor](../../../../qrk.sh/apps/library/modules/githubActivity/startGithubActivityResolution.ts)
   observes retained resolving rows, calls the existing same-origin provider API,
   decodes the module data and stages completion. Session-owned subscriptions,
   per-request Web Locks and disposal own execution; editor components do not.
4. [Completion](../../../../qrk.sh/apps/library/modules/githubActivity/makeCompleteGithubActivityContract.ts)
   applies only to the same brick, module, request identity, accepted state
   revision, resolving state and input. It writes ready data or a public failed
   outcome, increments state revision and invalidates measurements in the same
   transaction. Old responses and duplicate completions make no changes.
5. [githubActivityV1](../../../../qrk.sh/apps/library/modules/githubActivity/githubActivityV1.ts)
   owns nullable computed data and typed resolution state. Authored and generated
   rendering handle resolving/failed data explicitly. Saved presentation uses the
   live brick query; no accepted-state shadow masks authoritative rollback.

```ts
// 1. UI records the intent synchronously.
const result = stageAggregateSessionCommand({
  session,
  contractName: 'configureGithubActivity',
  payload: { brickId, requestId: crypto.randomUUID(), url: normalizedInput },
});
// 2. Only successful local staging discards the unsaved input.
if (result._tag === 'Success') clearDraft();
// 3. The session-owned executor reads the retained row and performs provider I/O.
// 4. completeGithubActivity rechecks request identity and state revision before writing.
```

## Lifetime, failures and storage

Closing the drawer does not cancel submitted work. Session disposal/reset releases RPC references and prevents late writes to a
replacement database. Already-sent HTTP/provider work may still finish. A new session
can rediscover retained resolving rows. This does not promise provider execution
while every browser session is closed, or provider exactly-once execution.

Provider failure is typed brick data. Synchronous refusal retains the draft;
later admission/execution refusal uses owner-level session notifications and
query rollback. Credentials, provider caches and existing identity checks remain
in the API Worker. No new backend owner, authentication policy, job table,
compatibility decoder, test file, fixture or check runner was introduced.

The fixed-schema cutover uses fresh isolated storage. Library's new
`/qrk-library-command-query-v1` backup namespace preserves previous backups;
standalone preview keys have the corresponding suffix. Existing Studio storage
is preserved and requires a fresh isolated runtime for the new declarations.

Activity validates nonnegative counts, contribution levels and ISO calendar dates;
the existing provider still supplies the recorded account/calendar response.

## Verification

Final evidence: `pnpm nx run-many -t build:app,build -p
@qrk.sh/library,@qrk.sh/studio,@qrk.sh/api` passed all four tasks.
The subsequent `@qrk.sh/library:build` passed after adding explicit state/spec
revision comparisons to the genuine pre-save measurement baseline.

Scoped Library reusable/app builds, Studio app build and API Worker dry-run passed.
The final rerun passed after owner notification and search traversal updates. Source
inspection confirms synchronous handlers, retained outcomes and stale guards.
No real provider request, backend integration suite or new test gate was run.

## Remaining work

None.
