# Agent Node behavior and E Pluribus Machina

**Date:** 2026-10-21. **Status:** Source research and interface recommendation for [Plan 249](../archive/plans/249-plan-aggregate-agent-backend-node.md). No implementation, dependency adoption, plan revision or runtime verification.


**Integer V1 cutover:** Shopping now registers only revision `1`; see the
[current Node definition](../../examples/shopping/src/zerospin/agents/reservationsAgentNodeDefinition.ts) and
[current registry](../../examples/shopping/agents.ts). The earlier declaration
citations below are pinned to the inspected source snapshot and preserve the
research's historical design context.

## Finding

Borrow E Pluribus Machina's **schema-backed states and state-specific routes** for the shared Agent Node behavior interface. They expose what can happen in each state more clearly than one `decide(reason)` program inspecting a collection of flags. Do not equate its Actor runtime or save hook with Zerospin's required transactional command staging, retained-stream consumption or durable retry/alarm behavior.

Zerospin already has `@zerospin/machine` with the same declaration concepts. The next design should assess that local machinery before proposing a new dependency on the sibling repository. The sibling names state-local invocations `commands`; the current local package names them `actions`, keeping them distinct from Zerospin's admitted commands. [Local package](../../packages/machine/README.md#L1-L24), [local route declarations](../../packages/machine/src/makeMachine/makeMachine.ts#L51-L71).

## Source findings

| Current source fact | Lesson for Agent Node definitions |
| --- | --- |
| `makeState({ stateName, input })` constructs a Struct schema with a tagged `stateName` and state-specific fields. | Give each behavior state exactly the data it needs. A waiting state owns its deadline; a finished state need not carry an optional deadline and unrelated pending flags. [Sibling State construction](../../../epluribus-machina/packages/core/src/makeState/makeState.ts#L60-L84), [local equivalent](../../packages/machine/src/makeState/makeState.ts#L58-L79). |
| `makeMachine({ states, initial, routes })` declares sparse routes by origin state. Each route receives the exact narrowed origin and its schema-derived payload. Its successful value belongs to the registered state union. | Put due-time handling on the waiting state and owned-completion handling on the releasing state. Avoid asking every invocation to distinguish every possible event and state combination. [Sibling Machine shape](../../../epluribus-machina/packages/core/src/makeMachine/makeMachine.ts#L58-L83), [construction](../../../epluribus-machina/packages/core/src/makeMachine/makeMachine.ts#L103-L125). |
| State descriptors own schemas; route placements own executable programs. Programs may return any registered state; there is no required second destination-map declaration. | Keep one source of transition behavior. A second chart or registry mirroring the route programs would add authoring work without establishing another invariant. Sparse routes can omit terminal states. [Declaration guidance](../../../epluribus-machina/wiki/patterns/machine/machine-routes-own-programs.ts). |
| `invokeCommandProgram` checks the route payload and `validateProgramSuccess` checks the returned registered state and its schema before commit. | Preserve runtime validation of loaded state, event input and the next state even when TypeScript narrows authored programs. Invalid returned state is an implementation defect, not a business retry. [Invocation](../../../epluribus-machina/packages/core/src/makeActor/invokeCommandProgram.ts#L8-L37), [returned-state validation](../../../epluribus-machina/packages/core/src/makeActor/validateProgramSuccess.ts#L18-L69). |
| The SQLite example accepts its loaded state as `initial` and constructs the Machine separately from the application runtime/storage. | A cold behavior declaration and its host's live state/storage are separate responsibilities. Retain one shared definition for browser/backend execution, with instance state loaded by the chosen host. [Example Machine](../../../epluribus-machina/examples/sqlite-counter/src/makeCounterMachine.ts#L7-L28), [example lifecycle](../../../epluribus-machina/examples/sqlite-counter/README.md#L3-L5). |
| The current Actor has a save hook, runs it before publishing/installing the next activation, and treats a failed save as terminal. The SQLite example explicitly does not retry routes and acknowledges ambiguous completion after state commit but before the caller receives a result. | Persistence-before-publication is useful ordering, but a state-row save alone does not atomically retain a new command input before admission or make external effects safe to replay. [Sibling save/install](../../../epluribus-machina/packages/core/src/makeActor/makeActor.ts#L411-L460), [example limits](../../../epluribus-machina/examples/sqlite-counter/README.md#L29-L38), [local save/install](../../packages/machine/src/makeActor/commitActorTransition.ts#L25-L65). |
| Handles capture an exact activation symbol; execution checks it before and after acquiring the permit. Late activation completion is ignored once another activation is current. Closing an activation closes its Scope and awaits its route Fiber. | Bind callbacks to their originating behavior revision/lifetime, refuse stale invocations and join owned work before release. A callback from an old row state must not stage a command for its replacement. [Handle identity](../../../epluribus-machina/packages/core/src/makeActor/makeActor.ts#L247-L285), [execution checks](../../../epluribus-machina/packages/core/src/makeActor/makeActor.ts#L532-L550), [late completion](../../../epluribus-machina/packages/core/src/makeActor/makeActor.ts#L464-L484), [scope cleanup](../../../epluribus-machina/packages/core/src/makeActor/makeActor.ts#L365-L387). |

## Proposed interface direction

Keep `makeAggregateAgentNodeDefinition` / `makeServiceAgentNodeDefinition` as the composition over the canonical agent release. Each selected model's behavior can declare its schema-backed states, row-derived initial state and sparse state-specific routes. The exact syntax remains proposed; this research does not introduce another factory or commit the plan to the existing Actor runtime.

At the Node integration seam, behavior evaluation needs **a next state plus declarative command/scheduling intentions**. Current `@zerospin/machine` route programs still return a registered state value, not a `{ state, command }` wrapper. A proposed Node adapter can supply a transaction-scoped intention collector to a route, collect its intentions and returned state together, then commit them inside the Node's transaction and lifecycle. It must not perform provider requests, sleep until a deadline, call a Durable Object alarm or independently commit a behavior state. Current machine route programs are general Effects; portability of that declaration does not make their arbitrary effects suitable for a pure Agent Node decision.

### Current machine API and the required Node adapter

- `makeState({ stateName, input })` creates a schema-bearing descriptor; `State.make(fields)` synchronously returns its validated state value. It is not an Effect to `yield*`. [State construction](../../packages/machine/src/makeState/makeState.ts#L55-L79), [synchronous value constructor](../../packages/machine/src/makeState/State.ts#L42-L53).
- `makeMachine({ states, initial, routes })` accepts concrete registered initial state and sparse state-keyed route placements. A placement supports only `onActivation` and/or `actions`. Each action has `payload` and `program`; `program` returns an Effect whose success is a registered state value. Arbitrary `wakeAt`, `onWake`, `onRowChanged` or returned `{ state, command }` fields are not current Machine APIs. [Exact route fields and inference](../../packages/machine/src/makeMachine/makeMachine.ts#L20-L71), [Machine construction](../../packages/machine/src/makeMachine/makeMachine.ts#L88-L110).
- A Node adapter must dispatch due-time, selected-row-change and owned-completion observations to actual declared actions, and read deadlines through an explicitly proposed state projection or collected scheduling intention. The adapter must fence lifetime/revision and commit next state plus collected command input atomically. This glue is not implemented by current `makeMachine`, `makeActor` or the Agent Nodes. [Current action invocation](../../packages/machine/src/makeActor/invokeActionProgram.ts#L8-L46), [returned-state validation](../../packages/machine/src/makeActor/validateProgramSuccess.ts#L18-L69).

For the promotion-reservation prototype, a small state graph is enough:

| Authored state | Data and legal decisions |
| --- | --- |
| `WaitingForExpiry` | Retains the recorded absolute `expiresAt`. Row change can keep/reschedule it or finish when no longer eligible. A due event rechecks eligibility/time and either keeps waiting or emits the release intention and moves to `Releasing`. |
| `Releasing` | Waits for the Node-correlated completion of its existing release command. Duplicate wakes do not emit another command. An owned success or `notReleasable` refusal finishes/reconciles the attempt. |
| `Finished` | No due or command-completion route. It expresses the current terminal workflow state, not a retained attempt log. |

This is an illustrative recommendation. The Node separately owns the frozen command envelope, producer coordinates, current command correlation and admission retry responsibility. Do not duplicate `commandId`, transport flags or an independent pending-command lifecycle in authored state merely to reproduce facts the Node already owns. A business refusal may choose a new attempt only where the behavior explicitly permits one; an uncertain admission resends its existing envelope.

The inspected prototype referenced `reservationsAgentRelease`: Service `promotion@1.1.0`, agent `reservations@1.0.0`, selected `status === 'reserved'` and `purchaseId === null`, and permitted command `releaseUncommittedReservation({ id })`. `reservePromotion` already records the absolute ten-minute expiry. On due processing, catch up through a published `serviceIndex`, re-read the selected reservation, then decide. The release contract checks status/binding but has no expiry guard; the automatic timing condition belongs to behavior, while manual early release retains its existing semantics. [Agent declaration](https://github.com/morgs32/zerospin/blob/0e3ad6f97f825faf23e26bf073949485579e9942/examples/shopping/src/zerospin/agents/reservationsAgentRelease.ts#L14-L37), [recorded expiry](../../examples/shopping/src/zerospin/services/promotion/ReservePromotionV1.ts#L66-L81), [ten-minute policy](../../examples/shopping/src/zerospin/services/promotion/promotionPolicy.ts#L1-L2), [release guard](../../examples/shopping/src/zerospin/services/promotion/ReleaseUncommittedReservationV1.ts#L30-L47).

## Host and durability limits

The chosen host still owns the transaction joining authoritative selected-resource/checkpoint installation, behavior transition and new command-input staging. Running an Actor route and then calling Node submission in another transaction would split those facts. A save hook receiving only origin/destination state does not itself supply the command intention or correct input-freezing/acknowledgement protocol. [Existing local save contract](../../packages/machine/src/makeActor/commitActorTransition.ts#L33-L46), [Plan 249 transactional requirement](../archive/plans/249-plan-aggregate-agent-backend-node.md#runtime-responsibility--revised-by-plan-151).

Browser execution uses its authoritative selected baseline, transient behavior state and lifetime-fenced timers. Backend execution uses durable current state/deadlines and its own alarm registry. Restoring `WaitingForExpiry` schedules the existing absolute deadline; it never restarts another ten-minute interval. Effect activation and sleeps are runtime work, not persisted deadline state. The inspected sibling declarations/runtime and SQLite example provide no durable Agent stream checkpoint, command outbox or alarm/deadline scheduler. Their state-only persistence is not that missing infrastructure. [Sibling declaration shape](../../../epluribus-machina/packages/core/src/makeMachine/makeMachine.ts#L110-L119), [SQLite example scope](../../../epluribus-machina/examples/sqlite-counter/README.md#L34-L38).

Keep the Actor lifecycle lesson as well: callbacks belong to an activation, scoped work must be cancelled/joined when that activation closes, and old callbacks must not act after replacement. Current local `@zerospin/machine` explicitly owns and joins action work and closes the previous activation before save/publication. This supports the Node's lifetime/revision fencing requirement without supplying durable restart behavior by itself. [Local lifecycle](../../packages/machine/README.md#L14-L24), [transition ordering](../../packages/machine/src/makeActor/commitActorTransition.ts#L25-L59).

The shared definition does not transfer state between hosts or enforce a distributed lease. Host choice remains the agreed explicit choice for the containing logical Node instance. State-specific routes improve authoring and validation; durable recovery, single-host wiring and Node transaction ownership remain separate requirements.

## Proposed reservation definition using current Machine declarations

The `makeState`/`makeMachine` calls and `routes.actions` shape below use current `@zerospin/machine`. `makeServiceAgentNodeDefinition`, its behavior adapter fields (`initial`, `wakeAt`, `events`, `createMachine`) and the injected Node command-intention collector are **proposed**, not existing exports. This is an authoring example, not compiled implementation.

```ts
import { makeMachine } from '@zerospin/machine/makeMachine';
import { makeState } from '@zerospin/machine/makeState';
import { Effect, Schema } from 'effect';

const WaitingForExpiry = makeState({
  stateName: 'waitingForExpiry',
  input: { expiresAt: Schema.Number },
});
const Releasing = makeState({ stateName: 'releasing', input: {} });
const Finished = makeState({ stateName: 'finished', input: {} });

export const reservationsAgentNodeDefinition =
  makeServiceAgentNodeDefinition({
    agent: reservationsAgentRelease,
    behaviors: {
      promotionReservation: {
        initial: row => row.expiresAt === null
          ? Finished.make({})
          : WaitingForExpiry.make({ expiresAt: row.expiresAt }),
        wakeAt: state => state.stateName === 'waitingForExpiry'
          ? state.expiresAt
          : null,
        events: {
          rowChanged: 'check',
          wake: 'check',
          commandFinalized: 'settled',
        },
        createMachine: ({ initialState, readRow, now, commands }) =>
          makeMachine({
            states: {
              waitingForExpiry: WaitingForExpiry,
              releasing: Releasing,
              finished: Finished,
            },
            initial: initialState,
            routes: {
              waitingForExpiry: {
                actions: {
                  check: {
                    payload: Schema.Void,
                    program: Effect.fn('reservation.check')(function* () {
                      const row = readRow();
                      if (!row || row.status !== 'reserved' ||
                          row.purchaseId !== null || row.expiresAt === null) {
                        return Finished.make({});
                      }
                      if (now() < row.expiresAt) {
                        return WaitingForExpiry.make({ expiresAt: row.expiresAt });
                      }
                      yield* commands.releaseUncommittedReservation({ id: row.id });
                      return Releasing.make({});
                    }),
                  },
                },
              },
              releasing: {
                actions: {
                  settled: {
                    payload: Schema.Void,
                    program: Effect.fn('reservation.settled')(function* () {
                      return Finished.make({});
                    }),
                  },
                },
              },
            },
          }),
      },
    },
  });
```

`readRow` and `now` read fresh invocation-scoped authoritative facts after the chosen host catches up through its published Service Agent checkpoint. `commands.releaseUncommittedReservation` synchronously collects an intention; it performs no RPC. The Node validates the returned state and commits that state with the frozen command input in one transaction, then delivers through its existing producer. The example's Machine returns only `WaitingForExpiry`, `Releasing` or `Finished` values, as the current Machine contract requires.

The proposed adapter dispatches an observation only when its mapped action exists on the current state. Thus row-change/wake observations do not issue another command while `Releasing`; the Node preserves its exact waiting correlation even if the reservation leaves the selection. `commandFinalized` means an exact owned completion of that outstanding command. This prototype routes owned Success and the expected `notReleasable` refusal to `settled`; neither uncertain delivery nor an unrelated public command can trigger it. There is no authored business retry after that refusal.

On reconstruction, the Backend Node passes the restored behavior value as `initialState`; it does not call `initial(row)` again for an existing behavior instance. `wakeAt` is a projection of current state, interpreted as a browser timer or durable Backend Node alarm by the chosen host. The waiting state's absolute recorded expiry is unchanged on restart. Host observation dispatch, transactional collection and scheduling remain the missing Node integration; no independent Actor owns the resource database or commits separately in this sketch.
