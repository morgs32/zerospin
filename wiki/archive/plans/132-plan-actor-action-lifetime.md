# 132 — Actor owns admitted action programs

Status: Completed and verified on 2026-10-11. Actor-owned action cancellation, serialized closure and already-started save completion are verified.

## Current evidence and the simpler owner

1. [makeActor](../../../packages/machine/src/makeActor/makeActor.ts) validates a canonical Machine, constructs observable initial Handles, and starts one owner in the application's ManagedRuntime. Each activation owns its Scope and automatic route Fiber. Its action executor, however, invokes the authored action directly in the calling Fiber while holding the transition semaphore. Supplying the activation Scope as a service does not enroll that calling Fiber in the Actor's lifetime.
2. `cleanupActor` changes Running to Closing and then waits uninterruptibly for the same semaphore before closing any activation or Actor Scope. An independently started action suspended forever therefore holds the gate forever: interrupting the Actor cannot cancel the program that prevents Actor shutdown. The existing closing-scope specification (`packages/machine/src/makeActor/tests/closing-actor-scope-stops-owned-work.spec.ts`, removed 2026-10-17) deliberately releases the suspended action after beginning closure. It establishes closing refusal, but does not establish cancellation of an indefinitely suspended action.
3. Make the Actor own each admitted action **program Fiber**, while its caller owns waiting for the result and cancellation of that invocation. There is only one running action program because the existing gate serializes calls. Keep that one active Fiber as lifecycle state; do not introduce an action queue, deduplication key, outbox, separate ManagedRuntime or durable invocation model.
4. The actual production consumer is browser [SessionLifetime](../../../packages/browser/src/sessionLifecycle/SessionLifetime.ts), whose [lifecycle Machine](../../../packages/browser/src/sessionLifecycle/makeSessionLifecycleMachine.ts) currently uses short synchronous control actions and scoped automatic startup/cleanup. Existing machine specifications and deploy activation (`packages/machine/test/deploy-activation/machine.ts`, removed 2026-10-17) are the other authored consumers found by exhaustive current source search. This corrects the exported Actor lifetime contract; it does not claim a currently observed browser shutdown incident.

## Required behavior, ordering and failure semantics

1. Preserve the public `makeActor`, app-owned ManagedRuntime, explicit one-shot `start`, `ready`, pre-start current Handle, current-first Handle stream and placement-owned Machine programs. Machine declaration/provenance validation still occurs before runtime acquisition. No public method or persisted schema changes.
2. An action first verifies Running and its activation identity, obtains the transition permit, then verifies both again. It decodes its payload and invokes its program through the existing [invokeActionProgram](../../../packages/machine/src/makeActor/invokeActionProgram.ts) contract. The program Fiber is enrolled in the Actor Scope and receives the original activation Scope service and captured application services. The completion/transition parent stays outside that program Fiber so closing the old activation cannot interrupt the transition that closes it.
3. Enroll and record the program Fiber under an interruption mask, then recheck Running before restoring interruptible waiting. This final recheck closes the race in which shutdown sets Closing before the new Fiber is recorded. If that happened, cancel and join the enrolled Fiber, clear the active slot and release the permit. Closure must never miss a Fiber that can subsequently wait while retaining the gate.
4. Caller interruption cancels and joins its admitted program before releasing the gate. Actor closure marks Closing, cancels and joins the recorded action program **before waiting for the transition gate**, then closes the current activation and Actor Scope in the existing order. Waiting callers acquire the released permit and refuse through the existing closed-owner boundary. No subsequent action or automatic completion can install another activation after Closing.
5. Successful program completion must pass the same destination/schema/declared-route validation. Under the permit, check Running once more and enter the existing uninterruptible transition: close previous activation, run the save hook in its own fresh Scope, install/publish the destination and start its automatic route. Closure waits for a commit that has already entered this region. Caller interruption cannot partially save or publish a transition. Preserve previous Handle visibility until successful destination publication.
6. Typed action failures and unexpected action-program defects remain local to the invocation, matching current behavior and the [unsettled TODO](../../../packages/machine/src/makeActor/TODOS.md). Preserve their complete Cause when joining; do not squash or convert them into infrastructure errors. Activation, save, close and install defects retain the existing exact-Cause terminal policy shared by `ready`, owner Exit and future actions. The active program interrupted by Actor closure now completes as interruption instead of needing to resume merely to discover Closing; later invocations retain the current outside-owning-Scope defect.
7. Interruption joins all cooperative program finalizers before shutdown reports completion. An authored uninterruptible program or finalizer that never completes can still prevent closure; Effect cannot forcibly terminate that program. Do not promise a timeout, forced resource close or rollback of external side effects. This library provides serialized transitions and an optional atomic save hook, not transactions for arbitrary authored action effects.

## Complete proposed parents

```ts
export function makeActor(machine: ICanonicalMachine, props: IActorProps) {
  const declaration = validateMachine(machine);
  const handles = makeActorHandles(declaration);
  const owner = makeActorOwner(declaration, props, handles);
  return makeActorFacade(owner, handles);
}

const runActorOwner = Effect.fn('runActorOwner')(function* (
  owner: IActorOwner,
) {
  const lifecycle = yield* acquireActorLifecycle(owner);
  yield* Effect.addFinalizer(() => closeActor(lifecycle));
  bindActionExecutor(owner, request => executeActorAction(lifecycle, request));
  yield* installInitialActivation(lifecycle);
  yield* publishActorReadiness(lifecycle);
  return yield* awaitActorTermination(lifecycle);
});

const executeActorAction = Effect.fn('executeActorAction')(function* (
  owner: IActorLifecycle,
  request: IActionRequest,
) {
  yield* assertCurrentActionOrigin(owner, request);
  return yield* owner.gate.withPermit(
    Effect.gen(function* () {
      const previous = yield* assertCurrentActionOrigin(owner, request);
      const success = yield* runOwnedActionProgram(owner, previous, request);
      yield* assertActorRunning(owner);
      return yield* commitActorTransition(owner, {
        previous,
        state: success.state,
        value: success.value,
      });
    }),
  );
});

const closeActor = Effect.fn('closeActor')(function* (owner: IActorLifecycle) {
  const mode = yield* beginActorClosing(owner);
  if (mode._tag === 'Closed') return;
  if (mode._tag === 'Defect') {
    return yield* closeTerminatedActor(owner, mode.cause);
  }
  yield* cancelAndJoinActiveAction(owner);
  yield* owner.gate.withPermit(
    Effect.gen(function* () {
      yield* closeCurrentActivation(owner);
      yield* closeActorScope(owner);
      yield* publishActorClosed(owner);
    }),
  );
});

const commitActorTransition = Effect.fn('commitActorTransition')(function* (
  owner: IActorLifecycle,
  transition: IActorTransition,
) {
  return yield* Effect.uninterruptible(
    Effect.gen(function* () {
      yield* closePreviousActivationOrTerminate(owner, transition.previous);
      yield* saveDestinationOrTerminate(owner, transition);
      const next = yield* installDestinationOrTerminate(owner, transition);
      return next.handle;
    }),
  );
});
```

1. These are complete schematic parents with proposed internal types. The real implementation retains the public Machine-derived generic signatures and erased boundary narrowing already present. `makeActorOwner` owns the actual one-shot owner state, ready Deferred and runtime launch; `makeActorFacade` is omitted as a separate file if returning the four existing methods inline is clearer. No forwarding-only wrapper is required.
2. `runOwnedActionProgram` owns fork, active-slot enrollment, closing recheck, caller cancellation, complete Exit propagation and slot cleanup together. It must never fork `commitActorTransition` inside the old activation Scope. Scope/supervisor close helpers retain their current full-Cause combination policy. Keep the gate around the whole admitted invocation; moving it only around publication would change independent-call semantics.
3. Keep at most one exported function per machine source file. Procedures have concrete Actor responsibilities and share only necessary lifecycle state, not a generic callback framework. Use `mapValues` for action-map and state-map traversal; remove the currently forbidden record-entry loops in touched construction.

## File hierarchy and exact removal

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
├── packages/machine/src/
│   ├── ~ makeActor/makeActor.ts
│   ├── + makeActor/runActorOwner.ts
│   ├── + makeActor/executeActorAction.ts
│   ├── + makeActor/runOwnedActionProgram.ts
│   ├── + makeActor/commitActorTransition.ts
│   ├── + makeActor/closeActor.ts
│   ├── ~ makeActor/{invokeActionProgram,makeHandleStore}.ts
│   ├── ~ makeState/decodeStateMap.ts
│   └── ~ types.ts — only internal lifecycle typing if needed
├── ~ packages/machine/src/makeActor/tests/ — update existing lifecycle expectations
├── ~ packages/machine/test/deploy-activation/ — preserve existing authored benchmark
├── ~ packages/machine/README.md
└── wiki/
    ├── ~ patterns/ — implemented Actor ownership convention
    ├── ~ architecture/ — actual lifecycle source citations
    └── ~ glossary.md — postimplementation reconciliation
```

1. Delete the caller-owned authored-program execution inside the actor semaphore and the shutdown assumption that gate acquisition can itself stop that work. Remove the sprawling closure's duplicate lifecycle responsibility as these cohesive procedures take ownership; do not retain two executors or a legacy shutdown path.
2. Browser SessionLifetime remains a caller of the unchanged Actor API. Coordinate with [111](111-plan-connected-worker-ownership.md) and [117](117-plan-session-reconciliation-and-evaluation.md) where session lifetime and runtime responsibilities meet; do not duplicate their resource/socket cleanup owners. Existing Machine declarations, action inference and deployment checkpoint domain remain unchanged.

## Implementation order and existing verification seams

1. Extract the necessary Actor lifecycle types and ordered transition procedure while preserving existing behavior. Add the one active action Fiber and implement masked enrollment plus post-enrollment Closing recheck. Preserve the separate program-versus-transition ownership before changing shutdown.
2. Make caller interruption cancel/join the program and clear its slot. Change Actor closure to cancel/join before taking the gate. Reconcile terminal close defects with the existing exact-Cause policy; keep typed/local action failures nonterminal.
3. Use existing closing-scope, independent-call serialization, old-handle, action/activation transition, explicit-start, save-hook commit and save-hook-defect specifications. Extend the existing closing specification for an indefinitely suspended cooperative action, cancellation/finalizer settlement, closure racing enrollment, queued callers and an already-started uninterruptible save. Do not create test files, fixtures, runners or configuration. The existing deploy benchmark verifies pre/post ownership-cut recovery and local action defects; it is not proof of real Durable Object crash persistence.
4. Resolved machine Nx targets are `lib`, `ts`, `lint`, `test`, and `tsc:typecheck`. `ts` includes the existing typecheck/spec source excluded by the production declaration target. Run `pnpm nx run @zerospin/machine:test`, `pnpm nx run @zerospin/machine:ts`, and `pnpm nx run @zerospin/machine:lint` after implementation, plus actual browser `lib`/`ts`/`lint` integration gates where changed. This review ran no tests or production checks and makes no pass claim.
5. Update module README and actual architecture/pattern citations after implementation. Reconcile the glossary; record an ADR only if the implemented Actor/caller cancellation trade-off meets the repository criteria. Do not settle the separate unexpected-action-defect TODO by implication. Archive after implementation and required verification complete.

## Implementation progress — 2026-10-11

Actor lifecycle orchestration now delegates to focused action, activation,
transition and close procedures. One enrolled action program Fiber is canceled
and joined before Actor shutdown waits for the serialized gate. Existing closing
specifications cover never-ending cooperative work, queued callers, caller
cancellation and enrollment/closure races. The existing closing specification
also suspends an already-started save, interrupts the Actor owner, verifies
closure remains pending while new actions are refused, then releases the save
and proves persistence, save-scope finalization and destination publication
precede closure completion. No new test file or fixture was added.

Machine `lib`, `ts`, `lint` and existing runtime/deploy tests passed on
2026-10-11: the final existing suite passes 18 files, 62 tests, including the
owner-close-during-save case, in `/tmp/zerospin-machine-132-owner-save-final.log`.
The focused closing specification also passes all eight cases in
`/tmp/zerospin-machine-132-owner-save.log`. The final machine `ts` and `lint`
gates pass; lint retains pre-existing package warnings and the added case
introduces none. Production source was unchanged by the final verification
repair. Machine library compilation and browser/React `lib`, `ts` and `lint`
integration passed in `/tmp/zerospin-goal-quality-8.log`. The package README describes
the implemented program/transition and Actor/caller cancellation boundaries.
The Machine action glossary now documents those same owners and exact close
ordering with source links. Exhaustive local pattern search found no existing
Machine Actor lifecycle rule to update; no broad new pattern was introduced.

## Remaining work

None. The required owner-close-during-save case, all machine gates and affected browser/React source checks passed.
