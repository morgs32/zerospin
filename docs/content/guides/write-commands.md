---
title: Validate and write commands
description: Submit typed commands, handle declared failures and results, and distinguish prediction from durable acceptance and execution.
order: 6
---

## Prerequisites

Use an initialized session whose definition explicitly lists the ordinary contract you want to invoke. The helpers infer its permitted contract names and payload types from that definition. Do not build encoded command envelopes in UI code or cast a string to bypass this relationship.

The current helpers are standalone functions imported from `@zerospin/sdk/browser`; `@zerospin/react` also re-exports them. Sessions supply the execution environment; they do not have a generic `session.stageCommand` method.

## Rehearse without submitting

Validation runs the bound guard, program and operation application in a disposable SQL transaction, then rolls back its writes. Successful validation returns `void` and consumes no application IDs. Use it for availability checks; validate again through staging when the user acts because the data may change between those moments. The underlying `rehearse(db, tx => effect)` operation is direct and has no transaction options bag.

```tsx title="Tic Tac Toe — inside a square click/availability component"
import {
  validateAggregateSessionCommand,
  stageAggregateSessionCommand,
} from '@zerospin/sdk/browser';

// gameSession is useSession(gameSessionDefinition); current is its queried row.
const payload = { id: current.id, board: current.board, square };
const available = validateAggregateSessionCommand({
  session: gameSession,
  contractName: 'playX',
  payload,
});

if (available._tag === 'Success') {
  const staged = stageAggregateSessionCommand({
    session: gameSession,
    contractName: 'playX',
    payload,
  });
  if (staged._tag === 'Failure') setError(staged.failure.message);
}
```

This is an excerpt using the named values in the [real board component](https://github.com/morgs32/zerospin/blob/main/examples/tic-tac-toe/src/app.tsx). A validation refusal is normally silent: it should not produce a notification every time you render a disabled button. A staged refusal is an actionable result.

## Understand what each successful call means

| Boundary                          | What has happened                                                         | What you may tell the user                                                            |
| --------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Aggregate staging returns Success | The optimistic tab transaction and command occurrence committed           | Their change is pending and locally visible                                           |
| Service staging returns Success   | The optimistic tab transaction and command occurrence committed           | Their change is pending and locally visible                                           |
| Server admission                  | The authoritative server accepted or refused the occurrence for execution | The request reached its authoritative owner                                           |
| Final execution                   | A confirmed occurrence, selected changes and any entitled refusal arrive  | The matching command completed authoritatively                                        |
| External continuation             | Retained provider work records its own outcome                            | Payment, shipping, or another external action completed according to its domain state |

Aggregate and service staging return synchronously after optimistic SQL changes and the local command commit, followed by any enabled best-effort journal callback outside the transaction. The journal does not commit atomically with SQL: committed-table observers may run first, and callback errors do not change the staging result. Readiness is checked at entry; a later observer withdrawing it does not reverse committed staging. Neither success is a Node-retention acknowledgement or a promise of server admission, execution or payment. The session owns background handoff and reconciliation.

Session telemetry is collected synchronously and published to the store in a coalesced microtask. Collector `flushOwn()` and `flush()` remain synchronous; this telemetry timing does not defer other session or lifecycle notifications.

## Submit a command and query its domain state

Shopping generates a purchase ID once when the user clicks. It submits that ID as immutable command payload:

```ts title="Shopping — synchronous checkout"
import {
  makeAggregateSessionModelId,
  stageAggregateSessionCommand,
} from '@zerospin/react';
import { purchaseV1 } from './aggregates/user/models/purchase/PurchaseV1';

const staged = stageAggregateSessionCommand({
  session: shopperSession,
  contractName: 'checkout',
  payload: {
    cartId: cart.id,
    purchaseId: makeAggregateSessionModelId({
      session: shopperSession,
      model: purchaseV1,
    }),
  },
});
```

The shared checkout program creates the preparing purchase and sets the cart's `checkoutPurchaseId`. One live query reads the cart, its items and `checkoutPurchase`. The button derives availability and progress from those rows. It needs no local pending state, completion subscription or memoized identity.

Cart creation is also part of one command: `addToCart` receives `newCartId` and `newCartItemId` creation candidates, then reuses or creates the cart and product line transactionally. Consecutive staging transactions see preceding optimistic writes; there is no first-cart acknowledgement wait.

## Handle failure and authored results separately

The helper result is `{ _tag: 'Success', success }` or `{ _tag: 'Failure', failure }`. Narrow that union before reading either member. Declared contract/actor/aggregate failures carry a code and typed details; framework/transport failures have their own meanings. Show useful messages, and branch on an explicit code only where the application knows that outcome.

Contracts can also declare **successful domain results**. Shopping's tracking refresh distinguishes `tracking-refresh-requested` from `tracking-refresh-pending`; both are successful results. Payment decline and quote refusal are retained purchase states, rather than failures of the continuation that records them.

`staged.success.staging.result` is the program's local staging result where the contract declares one. Canonical results and finalization remain on the server. Browser history carries `failure: PublicFailure | null` and selected deltas; read confirmed domain resources for server-confirmed behavior. A matching confirmed command ID settles pending optimism even when the delta is empty. See [Contracts and operations](/handbook/contracts-and-operations).

## Present later failures

Subscribe to the session store within the mounted component's effect lifetime:

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

The effect returns the unsubscribe function. `failure` is the latest reported
`IZerospinError`; every occurrence has a fresh reference, so repeated messages
still notify. This subscription observes new nonterminal refusals without
replaying the last failure on remount. Choose whether a form or this subscription
presents directly returned staging refusals to avoid duplicate messages; keep
presentation for later admission and execution refusals.

Terminal query, render, runtime and infrastructure errors publish
`status: 'failed'` and replace content through `SessionReady`'s required `renderError`.
Cleanup cannot overwrite that error. Errors outside the session runtime need
explicit `session.reportFailure({ origin: 'session', error })`. Explicit browser
offline state retains transport recovery. Payment decline, quote refusal and
reconciliation needs render through the purchase query; server-originated
continuations do not automatically notify the original session.

## Check retries by domain identity

An invalid move should prompt the user to read the current board. A lost connection should recover the retained occurrence. A checkout retains its purchase identity in the staged payload; payment recovery retains its provider idempotency key. Repeating a fresh command is safe only when the application contract makes that repetition safe.

The workspace examples expose `ts`, `lint`, and `build` checks. In your application's behavioral verification, exercise contract/SQLite/backend seams for guard refusal, committed prediction, authoritative rejection, and repeat delivery behavior. The current examples do not supply a general runnable behavioral suite. [Server and external work](/guides/server-and-external-work) shows why payment retry requires a retained business key. The [browser reference](/reference/browser) describes the exact session lifecycle.
