# QRK Library keeps local editing-session execution

**Date:** 2026-10-15  
**Status:** Complete; local scope implemented and checked.  
**Owner repository:** `qrk.sh`  
**Parent:** [command/query UI cleanup](160-plan-command-query-ui-cleanup.md)

## Decision and scope

The user clarified: the goal is removing asynchronous work ownership from the UI;
backend-based durability is not required. Keep Library as the existing standalone
local editor. Do not introduce an authenticated Library owner or reinterpret its
fixed local `acct_1` as a server tenant. Studio keeps its existing authenticated
user aggregate and selections.

Submitted intent lives in the existing brick/placement state. Module-owned local
executors run at the editing session's lifetime, outside forms and route pages.
Closing an editor leaves that work running. Session disposal/reset releases RPC references and blocks stale completion
against a replacement database. Already-sent HTTP/provider work may still finish. Retained
resolving rows can resume when an editing session opens again; execution with all
browser sessions closed is not promised.

## Implemented ownership

1. Library's initialized layout starts
   [`startLibrarySessionWork`](../../../../qrk.sh/apps/library/session/startLibrarySessionWork.ts)
   and disposes it with the session. Studio starts the same module-owned work
   under its existing user-session owner.
2. The composition starts seven module-specific provider executors and saved-spec
   generation. Each observes owned retained rows, performs its actual API request
   and stages a revision-guarded completion. There is no new generic job table,
   browser completion registry or component submission Promise facade.
3. Provider credentials, provider response caches and provider identity validation
   remain in the existing API Worker. Browser calls use its existing same-origin
   RPC route. Existing full-state write trust boundaries are preserved.
4. Library reset remains a local session operation. The fixed-schema cutover uses
   a new backup namespace instead of deleting previous local storage. No reset,
   migration, new authentication policy or authoritative state deletion occurred.

```ts
// 1. A form synchronously stages intent in its existing session.
stageAggregateSessionCommand({ session, contractName, payload });
// 2. Its session owner starts module-specific execution once.
const dispose = startLibrarySessionWork(session);
// 3. Closing the editor does not dispose the session owner.
// 4. Disposing/replacing the session releases requests and database subscriptions.
dispose();
```

This decision supersedes the earlier conditional durable-Library proposal and its
backend-isolation/durability acceptance requirements. No ADR is needed for this
local implementation choice.

## Verification

Final evidence: `pnpm nx run-many -t build:app,build -p
@qrk.sh/library,@qrk.sh/studio,@qrk.sh/api` passed all four tasks.
The subsequent `@qrk.sh/library:build` passed after adding explicit state/spec
revision comparisons to the genuine pre-save measurement baseline.

Library reusable/app, Studio app and API Worker dry-run builds passed. The final scoped
rerun passed after owner notification and search traversal updates. Source review
confirms preserved standalone declarations, admitted Studio selections, owner-level
cleanup, guarded completion and an isolated local backup namespace. No provider
request or new backend integration suite was run.

## Remaining work

None.
