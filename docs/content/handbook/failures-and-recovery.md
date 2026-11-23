---
title: Failures and recovery
description: Present business refusals, later synchronization failures, and uncertain outcomes without creating duplicate work.
order: 8
---

## A failure has a boundary

The UI must distinguish an invalid command from an unusable session or a command
whose completion is unknown. Expected refusals retain their result envelopes;
reported errors also update the existing session store. `failure` is the latest
reported `IZerospinError` or null. Lifecycle `status` decides whether the instance
remains usable. Managed React hooks own construction and generation replacement.
`SessionReady` contains the dependent reader boundary and requires
`renderError(error, retry)` for local terminal UI. Public provider children remain mounted.

| Report or result       | Meaning                                                                                 | Application response                                     |
| ---------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Staging `Failure`      | Local validation or evaluation refused the command                                      | Explain the refusal and permit corrected input           |
| Admission refusal      | The command did not enter its authoritative command chain                               | Show the recognized refusal; inspect capability/identity |
| Execution refusal      | An admitted command failed authoritative evaluation                                     | Show the recognized refusal and read reconciled state    |
| Recovery-origin report | Connected recovery restored usability but local work may be unconfirmed                 | Notify through the existing failure subscription         |
| Session-origin report  | Query, render, authentication or unrecovered startup/persistence/protocol defect failed | Render `renderError`; Retry constructs a fresh owner     |
| Missing query row      | The query succeeded without a matching row                                              | Present the ordinary empty state                         |

Recognized command and recovery reports preserve lifecycle status and readiness.
Their store occurrences preserve error fields, with fresh references even for
repeated messages. Command identity and retained command data remain the source for
command-specific handling; the latest error is not a retained command event.

The statuses are `idle` before initialization, `initializing` during acquisition,
`ready` with an initialized capability, `disposed` after explicit revocation and
`failed` after terminal reporting. Lazy Effect runtime acquisition stays idle.
Terminal reporting fences execution before atomically publishing `failed`, its
error and `initialized: null`. Cleanup, later reports and reconnects cannot
replace that first terminal error. Explicit disposal/reinitialization waits for
cleanup and preserves the latest nonterminal error; only a fresh instance starts
with null failure. `dispose()` resolves after asynchronous cleanup.

`useLiveQuery` returns `{ data, updatedAt }` with no `error` field. Initial query
failures throw an owned `SessionQueryError`; the owning boundary reports in
`componentDidCatch`. Committed reread failures synchronously report session
origin and end their subscription before React renders. Raw thrown null and
undefined remain distinguishable failures. Diagnostic database hooks retain
local error/recovery behavior without a terminal reporter. Foreign owned query
errors propagate through nested boundaries to the correct owner.

`renderError` receives an `IZerospinError`, preserving existing Zerospin fields
and normalizing foreign values to `session-failed` with diagnostic cause. Its
`retry` callback waits for cleanup, then constructs a fresh session and resets
the owning error boundaries. Repeated or stale callbacks cannot overlap owners.
An application-authored 404 presentation changes neither the error's status nor
the document HTTP response.

Transport recovery remains active when the browser explicitly reports
`navigator.onLine === false`. An unexpected transport failure while apparently
online is terminal. Browsers can report online without Internet access, so some
Internet outages take this terminal path. Nested application error boundaries
must let fatal query errors propagate to their owning session boundary.

## Recognize connection failures

Connected authentication distinguishes `node-credentials-timeout`,
`node-local-preparation-timeout`, `node-backend-timeout`,
`node-backend-unreachable` and `node-authentication-unavailable`. Their typed
public diagnostics distinguish credential acquisition, local preparation,
backend invocation and the absence of an attached authentication provider.
Backend diagnostics identify a sanitized endpoint and RPC operation, plus the
timeout where applicable; they omit credentials and backend causes/stacks.

When the browser explicitly reports offline, a connected session with exact
expected claims can reopen its eligible previously verified local identity
without acquiring fresh credentials. Existing local models and staged commands
remain available; a new partition is never created offline. Synchronization waits
for online authentication and server proof before sending pending commands.
Local sign-out invalidates remembered eligibility. An offline device cannot learn
about remote revocation until it reconnects.

If a classified unavailable snapshot request has no eligible remembered identity,
`node-offline-identity-missing` explains why the session cannot open locally.
Its cause retains the resolver-visible connection failure's code and message.
Refreshing credentials cannot silently replace an instance's full claims;
identity changes require a fresh owner. See
[the Node failure schemas](https://github.com/morgs32/zerospin/blob/main/packages/browser/src/Node/NodeErrors.ts)
and [browser retry ownership](/reference/browser#session-instance).

## Connected session recovery

Connected Aggregate and Service sessions recover retained-state failures and
unexpected connected startup or synchronization failures before publishing a
terminal session error. Recovery runs in production and development. Ordinary
authentication failures, network interruptions and command refusals keep their
existing handling; they do not authorize replacing local storage.

One recovery cycle is allowed per new session attempt. A fresh authenticated
snapshot must validate before destructive work. If that proof cannot be obtained,
storage is preserved. Recovery first attempts to preserve the complete retained
original-command stream, including its producer identity and command IDs. It
rebuilds resources from the snapshot and uses existing replay/admission to
reconcile those originals without creating new command identities.

For a recognized production storage format, if preserving repair cannot recover
the original-command stream, the SharedWorker may replace that namespace and initialize a
fresh producer. This fallback can lose local work. It never copies uncertain
commands into a new producer, and it changes neither backend data, login state
nor application drafts stored outside that namespace. Preservation is best effort;
there is no independent corruption-proof command journal.

Unknown command storage, missing producers and unsupported command dependencies
preserve the original data. An explicit local development clean uses a separate
namespace after the authenticated snapshot proves which System history it replaced.
[Connected storage upgrades](/reference/browser#connected-browser-storage-upgrades)

Attached tabs withdraw readiness while recovery runs. Replacement requires live
reset acknowledgements, and a still-attached tab that does not acknowledge within
15 seconds prevents it. Retired deliveries cannot install into a repaired
session, even when the repaired producer keeps the same identity. Replay finishes
before replacement projections become usable.

Successful preservation is silent. When local changes may have been lost or left
unconfirmed, the framework reports a nonterminal `origin: 'recovery'` occurrence
through the existing failure store after restoring usability. Subscribe before
the loading gate so an existing toast handler can receive a startup notice. Every
recovery attempt is recorded in diagnostics; no new recovery UI is required.

The cycle attempts preservation and at most one fresh-producer fallback. Failed
recovery becomes terminal through existing `renderError(error, retry)` handling.
Retry constructs a fresh owner and allows another bounded cycle; reloading also
starts a new attempt. Ordinary reconnects and successful recovery do not replenish
the allowance. Concurrent attachments join a recovery already in progress.

Framework error codes retain their stable identity and gain explanatory default
messages. Explicit context and application-authored business errors retain their
own wording. Checkpoint errors include public position/hash observations;
public RPC errors exclude backend causes and stacks.

## Handle the result envelope

Staging returns an `IResult` with either `_tag: 'Success'` and `success`, or `_tag: 'Failure'` and `failure`:

```ts
import { stageAggregateSessionCommand } from '@zerospin/sdk/browser';
import { useSession } from '@zerospin/react';
import { gameSessionDefinition } from './gameSessionDefinition';

export function useCreateGame() {
  const session = useSession(gameSessionDefinition);
  return (id: `gam_${string}`) => {
    const staged = stageAggregateSessionCommand({
      session,
      contractName: 'createGame',
      payload: { id },
    });
    if (staged._tag === 'Failure') {
      return { ok: false as const, message: staged.failure.message };
    }
    return {
      ok: true as const,
      sessionId: staged.success.sessionId,
      sessionIndex: staged.success.sessionIndex,
    };
  };
}
```

This success means local aggregate staging, as explained in [synchronization](/handbook/sessions-and-synchronization). Unexpected defects can throw even from synchronous aggregate staging or validation, separately from their declared `Failure` results, and also terminate the session through its store reporter. Service staging is also synchronous. Its later transport/admission work belongs to the session lifetime; the owner independently replaces terminally failed session content.

## Declare and recognize business errors

Use `ContractError.schema`, `ActorError.schema`, or `AggregateError.schema` with a concrete code and any structured extra data the user needs. Declare each failure at the contract/policy use site. Guards receive those declared constructors as `failures` and fail by yielding or returning the constructed error.

The public wire failure is JSON. Recognition with the exact contract's codecs supplies a typed error when known while preserving the transported failure. `resolveFailure(contract, publicFailure)` and `resolveSessionFailure(release, commandName, publicFailure)` are Effects for that recognition boundary. Do not assume a decoded class instance is already present in an arbitrary stored or received JSON value.

Browser command delivery and history carry `failure: PublicFailure | null`. A private refusal is disclosed only to its exact Actor name/version, full claims, Node and session. Agent observers receive public history without private command resolutions. Successful occurrences and other recipients receive `failure: null`. Confirmed command IDs settle matching pending optimism even when no rows changed; use a nonnull `aggregateIndex` or `serviceIndex` to distinguish confirmation from a pending row whose failure is also null.

Canonical `outcome` is `{ result: Success | Failure, finalizedAt }`.
Select its branch with `outcome.result._tag`; `finalizedAt` is outside both
branches. The local command's `stagingOutcome: { result, completedAt }` retains
its original preview result and time across ordinary Node view installation.
Neither nullable private `failure` nor the latest session error replaces those
separate facts. Canonical results and finalization remain in Chain history. `resolveContractResult(contract, saved)` checks command name/version and decodes such a retained result; browser command history supplies no authoritative result object. Failure to match the declaration is a protocol/identity error to investigate, not permission to decode with a different version until something succeeds.

## Observe new errors within the session owner

```tsx
useEffect(
  () =>
    session.store.subscribe((state, previous) => {
      if (
        state.status !== 'failed' &&
        state.failure !== null &&
        state.failure !== previous.failure
      ) {
        toast.error(state.failure.message);
      }
    }),
  [session],
);
```

Mount the observer for the whole session-owner lifetime, including initialization
and recovery; gate only readers and command UI on readiness. The effect owns
unsubscribe. It does not replay the current failure when mounted; terminal
presentation belongs to `renderError`. One throwing store observer is
logged without blocking other observers or terminal disposal. Choose either the
form's direct result handling or this subscription for staging-refusal messages
to avoid duplication; retain presentation for later admission/execution refusals.

`session.reportFailure({ origin: 'command', error })` accepts a recognized
command refusal. The framework uses `{ origin: 'recovery', error }` for a
nonterminal possible-loss notice. `{ origin: 'session', error }` accepts an unknown
terminal failure. Runtime defect reporting distinguishes Effect Fail from Die before
normalization and preserves the execution's original Exit/Cause. A merely
returned typed application failure is not automatically reported. Errors outside
that runtime, including application asynchronous callbacks, need explicit
reporting. Reporting does not change command outcomes.

## Retry the intended action safely

A disconnected response does not prove the server did nothing. Reuse the retained command identity for server retry/recovery, and inspect its confirmed occurrence, any private failure and authoritative domain state before submitting another irreversible operation. Re-running a command factory can make a new command ID and therefore new work.

A contract Effect exposes only its successful returned `{ operations, result }` batch. Failed attempts contribute no operations; retry or recovery returns a new complete batch. A later server failure prevents checked child operations from being applied. Result encoding also finishes before operation application. Keep irreversible provider calls in [external contracts](/handbook/external-work), where responses and continuation progress have explicit durable boundaries.

For local storage/schema incompatibility during pre-release development, use the documented empty-storage/reset path rather than writing a fallback decoder. See [development and deployment](/guides/develop-and-deploy).
