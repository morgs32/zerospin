# Session errors, terminal classification, and live queries

**Updated:** 2026-10-27

**Scope:** Aggregate/service session error observation, terminal lifecycle, React
query routing, and affected consumers. The source findings below describe the
pre-cutover snapshot. Plan 240 implements the replacement and is now archived;
its completion record includes authenticated Stackshirts verification.

**Implementation plan:** [Plan 240](../archive/plans/240-plan-session-store-failures-and-initializer-boundaries.md)
specifies the store lifecycle vocabulary, reporting/classification contract,
internal Initializer boundaries, consumer migration and verification.

## Implementation evidence

The committed producer `9236acb0a1` replaces the observable with `status`, `failure`
and `reportFailure`, and puts construction/ownership boundaries inside both
Initializers. All nineteen fixed-group packages were published at `13.0.0` and
installed in the five consumer checkouts. Scoped producer build/type/lint checks
and eight mounted React/SQLite scenarios passed, including immediate committed-query
fencing and nested-owner routing. Consumer checks and original-checkout integration
are recorded in Plan 240; this paragraph does not claim backend flow verification.

## Pre-cutover source snapshot

1. **Session state and failure observation are separate.** Aggregate
   `ISessionState` and `IServiceSessionState` have no `failure` field.
   `ISessionFailures` separately exposes `emit`, `fail`, `subscribe`, and
   `getSnapshot`. `makeSessionFailures` treats every event carrying `error` as
   terminal and retains the first `{ error }`; command events carrying `failure`
   remain observable without populating that snapshot. The wrapper distinguishes
   thrown `null`/`undefined` from no failure, but creates a second observable
   beside `session.store`. [Aggregate state](../../packages/core/src/aggregateSession/types.ts),
   [service state](../../packages/core/src/serviceSession/types.ts),
   [failure interface](../../packages/core/src/sessionFailures/SessionFailures.ts),
   [event union](../../packages/core/src/sessionFailures/ISessionFailureEvent.ts),
   [retention](../../packages/core/src/sessionFailures/makeSessionFailures.ts).

2. **The lifecycle and React equate a retained failure with terminal state.**
   `makeSessionLifecycle` disposes after its failure snapshot becomes non-null,
   and rejects execution and initialization from that snapshot. `makeSessionOwner`
   subscribes to both observables; `SessionContent` renders `renderError` instead
   of its children for every non-null failure snapshot. Those checks cannot be
   reused unchanged when ordinary refusals also populate `state.failure`.
   [Browser lifecycle](../../packages/browser/src/makeSessionLifecycle.ts),
   [React owner](../../packages/react/src/makeReactApp/makeSessionOwner.ts),
   [React session content](../../packages/react/src/makeReactApp/makeReactApp.tsx).

3. **Initial and later query failures take different routes.**
   `useLiveQueryOnDb` catches query construction and initial synchronous read
   failures during render. Public `useLiveQuery` wraps them in the owned
   `SessionQueryError`; `SessionErrorBoundary.componentDidCatch` reports the
   underlying value. Later committed-read failures instead invoke the configured
   `onError: session.failures.fail` callback directly: `makeLiveQuery` stops its
   subscription without publishing that error into its store. Public
   `useLiveQuery` already returns only `{ data, updatedAt }`.
   [Initial reads](../../packages/react/src/useLiveQueryOnDb.ts),
   [public hook](../../packages/react/src/useLiveQuery.ts),
   [query store](../../packages/live-query/src/makeLiveQuery.ts),
   [React boundary](../../packages/react/src/makeReactApp/makeReactApp.tsx),
   [owned query error](../../packages/react/src/SessionQueryError.ts).

4. **React can catch the render that observes an asynchronous failure.** It does
   not generally catch a bare throw in an event handler or asynchronous callback.
   `componentDidCatch` is a committed reporting point; render must remain pure.
   An application boundary inside `SessionErrorBoundary` can intercept a query
   error before the owning boundary sees it.
   [React boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary),
   [React render contract](https://react.dev/reference/react/Component#render),
   [current session boundary](../../packages/react/src/makeReactApp/makeReactApp.tsx).

5. **Effect defects and typed failures carry different meaning.**
   `reportSessionDefects` checks `Cause.hasDies` before squashing the cause;
   a typed `Effect.fail` does not automatically enter that reporting path.
   `makeSessionResult` returns an ordinary recognized failure for a sole typed
   failure. The same error value reported as a defect therefore cannot be
   classified by its code/status alone. `IRecognizedFailure` is a `ZerospinError`
   subtype and fits the base `IZerospinError` store contract.
   [Defect reporting](../../packages/core/src/sessionExecution/reportSessionDefects.ts),
   [session results](../../packages/core/src/aggregateSession/makeSessionResult.ts),
   [recognized failures](../../packages/error/src/matchZerospinErrorCode.ts),
   [error type](../../packages/error/src/types.ts).

6. **Existing errors already carry the required diagnostics.** `IZerospinError`
   names `ZerospinError`, with `_tag`, `code`, `message`, `status`, `extra`, and
   formatted `cause: string | null`. `prettyUnknownFailure` formats Effect causes,
   native error stacks, and other thrown values. Public JSON serialization
   excludes backend causes/stacks; normalization must preserve that distinction.
   [Error types](../../packages/error/src/types.ts),
   [error class](../../packages/error/src/ScopedError.ts),
   [construction and formatting](../../packages/error/src/makeZerospinError.ts),
   [public codec](../../packages/error/src/encodeError.ts).

7. **Zustand already provides direct observation.** Its installed implementation
   commits state before synchronously calling listeners with current/previous
   state, without catching listener exceptions. React compares external-store
   snapshots with `Object.is` and requires stable immutable snapshots while
   unchanged. A fresh error instance for each occurrence lets a selector of
   `state.failure` distinguish repeated equal-valued reports.
   [Installed Zustand](../../packages/core/node_modules/zustand/vanilla.js),
   [Zustand source](https://github.com/pmndrs/zustand/blob/main/src/vanilla.ts),
   [React external-store contract](https://react.dev/reference/react/useSyncExternalStore).

## Requested replacement

- **One observable error slot.** Add `failure: IZerospinError | null` to initialized
  and uninitialized aggregate/service store states. It records the latest
  reported error while the instance remains usable. Replace the separate
  `SessionFailures` observable, its exported Effect Context service and Layer
  requirements, and `makeSessionNotificationLayer`; migrate producers and
  consumers to the store. Direct `session.store.subscribe` consumers own the
  returned unsubscribe. Keep command results, retained command rows, and
  originating-command once-only reporting. This is in-memory state, not a new
  failure journal or durable storage migration.
  [Current failure interface](../../packages/core/src/sessionFailures/SessionFailures.ts),
  [browser application layer](../../packages/browser/src/makeBrowserSession/applicationLayer.ts),
  [browser session runtime](../../packages/browser/src/sessionRuntime.ts),
  [notification layer](../../packages/browser/src/makeSessionNotificationLayer.ts),
  [current originating-command observation](../../packages/browser/src/Node/makeSessionFailureObserver.ts).

- **One reporter and one classifier.** Every report normalizes the error, retains
  the transient report context, and obtains the classifier's decision. A terminal
  report fences execution before notifying subscribers, publishes `state.failure`,
  and guarantees disposal. Ordinary refusals
  can update `failure` without stopping execution. Classify before losing the
  distinction between typed failure and defect; explicit reports outside
  managed execution remain necessary. Do not infer terminality from an error's
  code, HTTP status, non-null field, or a broad assumption that every command-originated
  error is benign. Plan 240 specifies the recognized-command-refusal versus
  unexpected-session-failure classification policy.
  [Current distinct report origins](../../packages/core/src/sessionFailures/ISessionFailureEvent.ts),
  [Effect defect distinction](../../packages/core/src/sessionExecution/reportSessionDefects.ts).

- **Preserve diagnostics and occurrence identity.** Preserve existing `code`,
  `message`, `status`, `extra`, and `cause`; normalize unstructured defects to
  `IZerospinError` with their formatted original cause. Each independently
  reported occurrence gets a fresh instance, even with the same code/message.
  This replaces the old same-reference requirement with diagnostic fidelity.
  The store's base error need not preserve recognition-wrapper internals: typed
  command results retain their recognition separately. Do not introduce a
  generic prototype/private-field cloning framework. Once terminal retirement
  begins, retain the first terminal error through cleanup; later cleanup errors
  must not overwrite it or revive readiness.
  [Error constructor](../../packages/error/src/ScopedError.ts),
  [cause formatting](../../packages/error/src/makeZerospinError.ts),
  [recognized error representation](../../packages/error/src/matchZerospinErrorCode.ts),
  [current terminal retention](../../packages/core/src/sessionFailures/makeSessionFailures.ts).

- **Make terminal stopping independent of subscribers.** Establish the execution
  and readiness fence in the reporting owner and guarantee disposal even if an
  arbitrary store subscriber throws. Registering a disposal subscriber before
  application subscribers is insufficient by itself. Preserve the terminal
  decision through initialization, release, and cleanup state updates.
  [Synchronous listener loop](../../packages/core/node_modules/zustand/vanilla.js),
  [current lifecycle fence](../../packages/browser/src/makeSessionLifecycle.ts).

- **Keep query-store/React presentation and explicit committed-read reporting.**
  The requested query-store route retains the original thrown value internally;
  public `useLiveQuery` can observe it and throw owned `SessionQueryError` during
  render without exposing an `error` field. Recommendation: the committed-read
  origin also reports synchronously through the common classifier, replacing
  `session.failures.fail` and preserving the immediate execution fence. Reporting
  only in the boundary's later `componentDidCatch` leaves the session usable
  until React commits, which weakens current behavior. Initial render failures
  report in the committed boundary; do not mutate the session during render.
  Preserve a distinguishable internal failure snapshot for thrown
  `null`/`undefined`; the current `String(error)` conversion inside `toError`
  loses raw diagnostics. Diagnostic `useLiveQueryOnDb` retains local
  display/recovery. Nested application boundaries must rethrow owned fatal query
  errors, and repeated presentation must not replace the first terminal error.
  [Current query-store branches](../../packages/live-query/src/makeLiveQuery.ts),
  [public hook](../../packages/react/src/useLiveQuery.ts),
  [diagnostic hook](../../packages/react/src/useLiveQueryOnDb.ts),
  [owner routing](../../packages/react/src/makeReactApp/makeReactApp.tsx).

**Settled interface direction:** expose lifecycle status in the session store
alongside `failure`. The classifier's terminal decision updates lifecycle status
and retains the terminal error in the same store update. Nonterminal reports
update `failure` without stopping the session. `SessionContent` observes lifecycle
status to decide whether to replace its content; it must not infer terminality
from a non-null `failure` or reclassify from `failure.code`/`failure.status`.
Cleanup must preserve the terminal lifecycle status and its retained error.
Plan 240 specifies `idle`, `initializing`, `ready`, `disposed` and `failed`.
[Current terminal checks](../../packages/browser/src/makeSessionLifecycle.ts),
[current React check](../../packages/react/src/makeReactApp/makeReactApp.tsx).

## Consumer scan and migration implications

- **Zerospin:** all five application `useLiveQuery` calls read data without local
  query-error handling; the docs already describe session
  termination. Five Devtools/Studio `useLiveQueryOnDb` consumers intentionally
  retain diagnostic errors.
  [Shopping](../../examples/shopping/src/components/ProductList.tsx),
  [TicTacToe](../../examples/tic-tac-toe/src/app.tsx),
  [query guide](../../docs/content/guides/query-data.md),
  [Devtools](../../packages/devtools/src/sessions/sessions/sessionId/commands/SessionsCommandsRowsTable.tsx),
  [Studio](../../packages/studio/src/AgentPreview.tsx).
- **Zerospin Cloud:** the earlier scan found a stale public-query error consumer
  in `AdminSystemSidebarGroup`; a later reread found only `{ data: system }`.
  That file changed concurrently; this research did not remove the branch.
  [Current Cloud component](../../../zerospin-cloud/admin/src/components/AdminSystemSidebarGroup.tsx).
- **QRK Library:** `LibraryLayout` wraps route children in
  `LibraryApp.Initializer`; Next's `app/error.tsx` supplies an inner route boundary
  whose `LibraryError` does not rethrow `SessionQueryError`. From this placement,
  an initial route-child query failure can be caught before the session boundary;
  the proposed later-read route has the same interception risk. This is
  source-derived, not new browser verification.
  [Root layout](../../../qrk.sh/apps/library/app/layout.tsx),
  [session layout](../../../qrk.sh/apps/library/app/LibraryLayout.tsx),
  [inner error presentation](../../../qrk.sh/apps/library/app/error.tsx),
  [Next error convention](https://nextjs.org/docs/app/api-reference/file-conventions/error).
- **Stackshirts:** Payment and Purchase put an imperative session beneath
  `AccountStartupBoundary`, which unwraps `SessionQueryError` into a local failure
  callback. `OwnedSession` mounts readiness/Suspense without standard
  `SessionContent` terminal presentation. These callers need integration with the
  common reporting/terminal-owner interface; simply deleting their boundary
  would lose behavior.
  [Startup boundary](../../../stackshirts/apps/storefront/src/sessions/AccountStartupBoundary.tsx),
  [imperative owner](../../../stackshirts/apps/storefront/src/sessions/OwnedSession.tsx),
  [Payment](../../../stackshirts/apps/storefront/src/screens/Payment.tsx),
  [Purchase](../../../stackshirts/apps/storefront/src/screens/Purchase.tsx).

## Acceptance boundary

Use existing scoped checks to establish ordinary refusal observation without
retirement; repeated equal-valued reports; defect normalization with cause
preservation; terminal fencing despite throwing observers; first-terminal
retention through cleanup; direct subscriptions; and initial/later query routing
through nested boundaries. A missing `findFirst` row remains ordinary data.
Terminal recovery requires a fresh owner. Existing explicit browser-offline
transport recovery is not redefined by this proposal.
[Query guide](../../docs/content/guides/query-data.md),
[current lifecycle](../../packages/browser/src/makeSessionLifecycle.ts),
[browser offline predicate](../../packages/browser/src/Node/isBrowserOffline.ts).

This research changes documentation only. It does not establish implementation,
checks, browser behavior, or sibling migrations passed. Do not add test files,
fixtures, runners, or configuration for this task.

## Verification blockers after the cutover

All scoped producer and consumer compilation/build checks passed, including Mentor
Admin after the maintainer requested deletion of the absent adminDirectory feature.
Actual QRK Library rendering and explicit-offline operation passed. Authenticated
Stackshirts Payment/Purchase browser checks remain pending: Clerk reported
`external_account_not_found`, and the normal backend startup rejected its existing
legacy migration-ledger shape. No storage was reset. The active plan records the
remaining decisions and evidence.

Clerk's [Frontend API errors](https://clerk.com/docs/guides/development/errors/frontend-api#externalaccountnotfound)
identify this error as a missing external account during an OAuth callback or
transfer. That documents the error class; it does not establish which account-state
condition caused this particular callback.
