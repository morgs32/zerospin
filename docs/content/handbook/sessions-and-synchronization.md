---
title: Sessions and synchronization
description: Understand session ownership and the distinct staging, persistence, admission, and execution boundaries.
order: 7
---

## One definition, independent live instances

A pure session definition holds executable declarations; constructors receive application layers and browser host wiring separately. A live session instance retains that definition for one owner and identity, acquires its runtime, opens its projection, and maintains synchronization. Two sibling React owners can use the same definition while retaining independent instances.

In React, call a concrete managed hook such as
`useConnectedAggregateSession(gameSessionDefinition, options)`. Publish its
non-suspending handle through `SessionProvider`, then gate dependent readers and
commands with `SessionReady definition={gameSessionDefinition}` and required
`renderError(error, retry)`. `useSession(gameSessionDefinition)` reads the ready
session; `useSessionState(gameSessionDefinition)` observes availability outside
the gate. Hooks start after commit and own disable, replacement, retry and disposal.
Identity changes update hook options without remounting the provider's public
children. Mock hooks use the same definition and consumers with local claims/seeds.

Outside React, create a session with the corresponding concrete browser constructor with `{ definition, layer, ...inputs }`, await `initialize()`, use it, then await `dispose()`. Construction is cold. The live facade selects a disposable lifetime with one private lazy runtime and exposes `runSync` and `runPromise`. Each initialization acquires its replica before starting its concrete connection. Standalone uses its own local connection without backend admission or authentication controls.

## Know what success means

| Boundary                     | Durable or local fact                                                                                                                            | What remains                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Local staging                | The Aggregate or Service session committed its own command, `stagingOutcome: { result, completedAt }` and optimistic model changes synchronously | Node retention, canonical admission and execution                    |
| Node retention               | AggregateNode or ServiceNode retained the original input and returned `sessionId`, `sessionIndex`, `nodeId`, `nodeIndex` and `pushIndex`         | AggregateChain or ServiceChain admission and canonical execution     |
| Canonical admission          | AggregateChain or ServiceChain retained the admitted command at its assigned `aggregateIndex` or `serviceIndex`                                  | AggregateVersionRepo or ServiceVersionRepo execution                 |
| Execution commit             | The VersionRepo committed model changes and complete pending publication; its VersionChain retains the evaluated command and `outcome`           | Chain acknowledgement, selected publication and any outgoing work    |
| Original `outcome` retention | AggregateChain or ServiceChain retained the original `outcome: { result: Success \| Failure, finalizedAt }`                                      | Each continuation or destination command has its own later `outcome` |
| Selected view installation   | The session installed a coherent Node view with applicable same-ID final resolutions                                                             | The UI still interprets explicit domain progress                     |

Both staging helpers return synchronously after their local SQL transaction commits
and any enabled browser journal write attempt completes. The journal callback runs
outside the transaction; committed-table observers may already have run. Journal
storage is independent of SQL commit, and a callback failure cannot turn committed
optimism into rejected staging. Readiness is checked at entry; a later observer
withdrawing readiness does not reverse a committed command.
Read `success.stagingOutcome.result` for the typed local program result and
`success.sessionId` and `success.sessionIndex` for submission identity; canonical ID is allocated during Node handoff. A rejected staging attempt retains no command
or optimistic changes. A page close immediately after successful staging does
not guarantee Node retention. Unexpected handoff failures follow the terminal
session-error path.

Connected Aggregate and Service sessions, and Standalone Aggregate sessions,
attempt a synchronous localStorage journal write for each successfully staged
command before staging returns. The journal offers best-effort recovery from document closure before Node
retention. It is not atomic with SQL and has no journal-before-table-observers
ordering guarantee. A later session recovers the original command and submission
coordinates through the ordinary Node retention path; it does not stage a new
command. Any storage failure preserves ordinary staging and handoff. This is
best-effort browser recovery, so a successful staging return still does not prove
Node retention or authoritative execution. The journal entry is removed after
validated Node retention, independently of later execution.

Connected recovery remains scoped to the complete authenticated identity.
Standalone recovery uses its existing storage identity: authored session scope,
generated backup path and complete session lock. Changing a valid non-path claim
does not create another storage partition or cancel a pending original. For
example, a command staged with one set of valid claims can be recovered by a later
attachment to the same owner with different incidental claims; authoritative
local execution still uses the command's original claims. The original's Aggregate
ID must agree with both its claims and the storage owner. Reset changes `nodeId`,
so earlier journal entries cannot enter the replacement Node incarnation.

The originating session keeps one row for each of its own commands. Node retention
coordinates stop repeated handoff without removing its local overlay. The canonical ID follows
from the retained `nodeId` and `pushIndex`; the session's `sessionId` and
`sessionIndex` remain its original local submission identity. Handoff and recovery
carry the same Node command with flat allocation fields. Null allocation means the
session has not learned retention, including after a lost reply; it does not prove
the Node lacks the command. Canonical
`outcome` stays in Chain history. AggregateNode and ServiceNode consume selected
command deltas and publish complete coherent views to attached sessions; a session
does not copy another tab's command history or reapply an old final delta.
A compact same-ID resolution settles its local command even when no selected
rows changed and its private `failure` is null. A null failure alone proves
neither resolution nor canonical success. Connected private failure disclosure remains scoped to the originating identity,
full claims, Node and session. Standalone retains each original's claims within
its shared storage owner, including when another valid attachment recovers it.

For irreversible server work, observe authoritative domain resources and their
explicit progress; see [the server and external-work guide](/guides/server-and-external-work).

Session telemetry collection is synchronous, but its store snapshot publication is
coalesced into a microtask. `flushOwn()` drains produced records synchronously;
`flush()` returns and clears the complete buffer synchronously. A pending
publication uses the latest buffer, so a flush cannot resurrect records. Other
session state and lifecycle notifications retain their existing timing.

Validation rehearses the bound guard, program and operation application in a
disposable SQL transaction, then rolls back all writes. Direct `rehearse(db, tx =>
effect)` succeeds with `void`; it has no options bag. Session validation substitutes
disposable IDs and does not stage a command or invoke the journal callback.

## Install a Node view without duplicating optimism

AggregateNode and ServiceNode maintain a shared view of authoritative resources
plus their retained pending commands. An attached session installs that captured
graph, then replays only its own unresolved commands outside the captured Node
prefix. Ordinary installation preserves the original payload and
`stagingOutcome`, including its original result and completion time.

For example, AggregateNode captures a view that already includes command A.
Before that view reaches the tab, the session stages command B. Installation
replaces the session's graph with the captured graph containing A, then replays
B because the captured Node prefix does not cover it. A appears once and B
survives. Service sessions follow the same rule with `serviceIndex` as the
authoritative checkpoint position; Aggregate sessions use `aggregateIndex`.

The resource replacement, command resolutions, checkpoint and replay commit in
one synchronous transaction. A replay refusal can leave an unresolved command
without active optimistic changes; an unexpected defect rolls back installation.
Neither installation nor replay creates an admitted command or a canonical
`outcome`. See the implementation workflows for
[Aggregate installation](https://github.com/morgs32/zerospin/blob/main/packages/core/src/aggregateSession/installAggregateNodeView.ts)
and [Service installation](https://github.com/morgs32/zerospin/blob/main/packages/core/src/serviceSession/installServiceNodeView.ts).

## Read the projection reactively

The initialized session publishes a SQLite database through its store. `useLiveQuery` subscribes to that projection and returns `data` and `updatedAt`. A failed query terminates its whole session; a missing row remains an ordinary result. A command's optimistic writes and later authoritative updates invalidate relevant queries, so the UI reads state without a polling timer.

Keep captured query inputs in the hook's `key`, particularly when switching a selected resource. The key controls subscription identity. Querying another row in the same initialized capability is different from switching the capability's account, aggregate ID, or seed inputs.

The SharedWorker hosts AggregateNode or ServiceNode shared by the complete session identity across tabs. The tab hosts synchronous local staging and its session replica. AggregateChain/ServiceChain own admitted commands, VersionRepos own canonical model execution, and selected-view Repos publish actor resources through their Chains. These roles explain why local mutation, local persistence, and server completion are separate events.

## Retain identity for the whole lifetime

Authenticated instances supply a credential callback; refresh its implementation when tokens rotate. An identity or owner change requires a new instance. Update managed React hook options with the aggregate/resource and account identity; the hook revokes the old capability and replaces its internal generation without keying public UI.

`dispose()` revokes readiness synchronously before completing asynchronous cleanup. Do not retain a session from an unmounted owner and keep calling it. `clearAuthentication()` is available on authenticated aggregate/service facades and revokes their authentication; it does not retarget them to a different account.

A standalone session has local claims, backup identity, and optional seeded resources. Its `reset()` clears its standalone state and fences the earlier Node incarnation, including pending journal recovery. It has no server admission or server-confirmed execution. Aggregate and Service Agent sessions observe a registered Agent release without staging or scheduling behavior; see [Studio and agents](/guides/studio).

Connected Aggregate and Service sessions recover retained-state and unexpected
startup/synchronization failures in production and development. One bounded cycle
first preserves readable original commands and their producer identity, then may
replace an unrecoverable namespace with a fresh producer. Destructive work needs
a fresh authenticated snapshot and live reset acknowledgements. Recovery withdraws
readiness until the baseline and replay are usable; possible local-work loss is a
nonterminal failure-store notice. Reload or Retry starts a new attempt; ordinary
reconnects do not. See
[connected session recovery](/handbook/failures-and-recovery#connected-session-recovery).

## Observe later failures

The existing `session.store` owns `failure: IZerospinError | null` and lifecycle
`status`: `idle`, `initializing`, `ready`, `disposed` or `failed`. The latest
reported error has a fresh reference for each occurrence. Recognized staging,
admission and execution refusals and possible-loss recovery notices preserve
readiness. Mount notification observers through loading and recovery. Query
failures, escaping defects and unrecovered infrastructure failures atomically
publish `failed`, the
error and `initialized: null` after fencing execution. Cleanup cannot replace
that first terminal error. Only a fresh instance starts with null failure.
Ordinary disposal/reinitialization preserves nonterminal failure and waits for
successful cleanup; failed cleanup prohibits reinitialization. Lazy runtime acquisition alone stays idle.

For React ownership, pass `{ onFailure }` as the managed hook's third argument.
The observer receives changed nonterminal failures before initialization and through
recovery. Non-React owners subscribe with `session.store.subscribe` and release
that subscription with their lifetime. Terminal React presentation belongs to
`SessionReady`'s required `renderError(error, retry)`. Its query boundary handles errors
owned by that session. Ordinary UI render exceptions reach the enclosing React
error boundary. Session-owned failures outside session execution need explicit
`session.reportFailure({ origin: 'session', error })`. Explicit browser offline
state retains transport recovery; unexpected online transport failures terminate
the session.

Handle the direct `IResult` for the user's command and the notifications for failures after that call. The [failure handbook](/handbook/failures-and-recovery) explains the recovery choice at each boundary; the [browser reference](/reference/browser) lists the public methods.
