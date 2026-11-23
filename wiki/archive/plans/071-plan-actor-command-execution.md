# 071 — Execute actor commands without a browser session

**Date:** 2026-10-08
**Status:** Superseded by consolidation into [Plan 069](069-plan-rpc-call-stack-cleanup.md) on 2026-10-08. This is not completed feature implementation. All continuing actions and open decisions are recorded there.

## Goal and scope

1. Let an authenticated aggregate actor execute an ordinary declared command before opening a replicated browser session. QRK's concrete use case is creating its application User before authorizing its ordinary web session.
2. Keep command execution inside Zerospin's existing RPC, command, guard, transaction, and retained-result machinery. Do not introduce an application HTTP registration endpoint or special registration framework.
3. Implement the upstream affordance first. QRK's adaptation is a follow-up; this document describes that flow but does not request consumer edits, package publication, dependency updates, storage resets, or changes to Red Rope Parking.
4. The original separate-plan arrangement was superseded by the user's request for one plan. [Plan 069](069-plan-rpc-call-stack-cleanup.md) now owns this work within its current admission iteration.

## Agreed decisions

1. Authentication receives credentials, establishes accepted actor claims, and returns those claims for framework validation. Remove command execution from the aggregate authentication callback once its replacement is available. Registration is an application command, not an implicit authentication side effect.
2. Aggregate `authentication: 'none'` and direct claims admission were removed by [070](070-plan-required-aggregate-authentication.md). Preserve that cutover. Do not revive the two-source claims explanation: aggregate claims now come from the authentication callback.
3. An admitted actor's contract catalog bounds the commands it can submit. Contract/actor/aggregate guards enforce state-dependent and payload-dependent command permission during authoritative execution, inside the mutation transaction.
4. Keep the actor authorizer focused on opening a session. Do not add a command/session operation discriminator to `authorize`, separate command-authorization callbacks, or a command-specific capability merely to wrap a command name. No additional `authorizeCommand` ceremony was accepted.
5. Direct execution uses the same actor and ordinary contracts as session-based execution. A session additionally supplies local state, optimistic execution, and synchronization. Do not silently change existing optimistic staging into synchronous remote execution.
6. The application-facing direct operation accepts an executable contract declaration and its inferred payload. The SDK derives contract name/version and wire encoding; executable declarations and callback functions do not cross RPC. The server resolves its own declaration within the retained actor and aggregate release.
7. The caller does not supply or allocate a command ID. The SDK constructs one ordinary command occurrence and allocates its ID internally, using existing construction machinery. Internal RPC still carries stable command identity.
8. Transport retries of one invocation reuse the same command occurrence and ID. A separate intentional invocation creates a separate command. Fresh server-side allocation for every retried RPC is unsuitable because a lost response could produce a second mutation.
9. The access capability retains accepted claims, aggregate identity, and actor name/version privately. A direct call cannot replace those fields, select another actor, or submit a system/agent/external-response origin.
10. Direct execution waits for an authoritative final result, preserving admission and execution failure distinctions. Staging acknowledgement, optimistic state, and network failure are not proof of authoritative creation. A lost response can mean the remote outcome is unknown.
11. The absence of a browser session does not itself justify deleting existing server staging. Reuse the actual direct-command production path and preserve its ordering guarantees until source establishes that a stage can safely be removed.
12. Preserve synchronous transaction ownership and mandatory execution guards. Remote calls happen outside SQLite mutation transactions; registration and later session authorization do not become one distributed transaction.
13. Existing Red Rope admin/session machinery is not a design constraint. Do not retain it merely as precedent or expand this work into that repository. Within in-scope upstream callers, ensure direct command access does not silently rely on session-only checks for mutation permission.

### Intended caller experience

This is the accepted application-facing shape, not a claim that this SDK object exists today:

```ts
// Authentication binds the actor and accepted claims to an SDK-facing access object.
const access = /* acquire admitted actor access */;

// The SDK creates the command ID and serializes the contract name/version and payload.
await access.executeCommand({
  contract: createUser,
  payload: { /* initial user data */ },
});

// QRK then initializes its existing browser userSession through the ordinary initializer.
// Registration does not implement snapshots, browser SQLite, tickets, or synchronization.
```

An `AggregateSessionApi` returned by RPC session authorization is a server capability. It is not the persistent browser object returned by `makeSession`; do not confuse or substitute those objects in the consumer flow.

## Designs considered and superseded

1. `POST /register` on QRK's API Worker: superseded by the preference to use Zerospin's RPC affordances. No separate HTTP endpoint is part of this design.
2. A registration-only replicated session: discussed as an existing-framework alternative, but the user preferred direct execution before the ordinary session. Do not require a temporary replicated session to execute registration.
3. QRK's existing `userProvisionerV1`: discovered as a real current consumer of authentication's `executeCommand`; the user rejected preserving this actor as the proposed design. QRK's eventual ordinary user actor will declare `createUser` directly.
4. `access.authorizeCommand(...).execute(...)`: superseded. Minting another capability without a delegation requirement adds an interface with no established responsibility beyond the actor catalog and guards.
5. One `authorize` callback with `{ kind: 'command' | 'session' }`: explicitly rejected as a poor model. Keep mutation permission in guards and session access in the existing session authorizer.
6. Keeping registration inside `authenticate`, introducing a session-preparation hook, or hiding registration inside `getCredentials`: not the selected design. QRK explicitly composes registration before session initialization.
7. Explicit application-supplied `commandId`: superseded by SDK-owned command construction. This does not remove IDs from the internal command protocol.
8. Generic user upsert on login: not accepted. Creation must leave existing profile data, membership, permissions, and disabled-account state alone. Repeat safety is domain-owned, alongside transport retry identity.

## Current source and implications

1. [AggregateAccessApi](../../../packages/system-worker/src/AggregateAccessApi/AggregateAccessApi.ts) currently exposes only session authorization. Its retained admission context is the natural source of authority for the proposed direct RPC.
2. [Aggregate authentication types](../../../packages/core/src/identity/types.ts) still supply `executeCommand` to `authenticate`; [admitAggregate](../../../packages/system-worker/src/AggregateApi/admit/admitAggregate/admitAggregate.ts) embeds that callback's implementation. Extract/reuse the necessary direct execution behavior and delete this obsolete callback interface through a hard cutover.
3. [makeCommand](../../../packages/core/src/contracts/make/makeCommand.ts) already accepts a contract and payload and allocates an ordinary command ID. [getApi](../../../packages/core/src/utils/getApi/getApi.ts) currently opens a fresh HTTP batch per Effect execution, synchronously selects capabilities, and supplies no retries or shared RPC session state. Do not claim it already provides the needed public wrapper or retry lifetime.
4. [stageDirectAggregateCommand](../../../packages/system-worker/src/AggregateProjectionRepo/stageDirectAggregateCommand.ts), [AggregateChain.executeAggregateCommand](../../../packages/system-worker/src/AggregateChain/executeAggregateCommand/executeAggregateCommand.ts), and [AggregateVersionRepo.execute](../../../packages/system-worker/src/AggregateVersionRepo/execute/execute.ts) are production paths to inspect and reuse. Preserve their real authority, staging, idempotency, and exact-result recovery responsibilities.
5. QRK currently creates its User inside `userActorV1.authenticate`, under `userProvisionerV1`. It handles duplicate subjects and tests lost responses and concurrent authentications. There is no explicit session authorizer on the ordinary QRK user actor today; moving creation alone does not enforce User existence before session access.
6. Red Rope currently verifies Clerk and creates its Member later through the ordinary `submitIntake` session command. Its current authentication callbacks do not consume the authentication command capability. The earlier search also found no such consumer in Zerospin examples or Explorer; QRK must not be omitted from the dependency audit.
7. The source tree was clean when this planning pass began. Inspect current status/diff again before implementation; other chats may be working in the same checkout. No feature code or feature tests have been changed or run in this side conversation.

## Implementation sequence

1. Resolve the remaining SDK and transport questions below against current source. Keep the agreed permission model and caller experience fixed; amend active Plan 069 with the concrete entrypoint, types, wire request, and retry lifetime before implementation.
2. Add direct actor command RPC to the admitted access capability. Decode its request at the API seam; resolve exact actor/contract membership from retained context; construct actor-origin command metadata from that context; reject malformed payloads and forbidden origins before side effects.
3. Connect it to production direct command staging and authoritative execution. Return existing final result/failure and telemetry conventions. Retrying a retained command must recover its original occurrence and execution selection, never reapply a mutation.
4. Add the typed SDK operation that owns ordinary command construction and hides ID allocation. Preserve inferred payload/result types, browser-safe imports, capability scoping, and existing HTTP batch selection rules. Do not change generic `getApi` retry semantics merely to support this one affordance.
5. Remove authentication's `executeCommand` input and embedded command path. Update in-scope upstream callers, type assertions, checks, and affected docs directly, with no compatibility alias or dual interface. Do not automatically update QRK's pinned packages or its source as part of this upstream step.
6. Audit in-scope mutation guards for assumptions previously established only by session access. Express required command permissions at authoritative guard ownership; preserve legitimate default/public actors. Do not add another authorization dispatch framework to compensate.
7. Run the scoped verification below. Reconcile implemented terminology in existing architecture/module docs and glossary afterward. Create an ADR only if the final implemented decision satisfies repository criteria; do not add glossary terms or ADRs during planning.
8. Record verified outcome and remaining work in active Plan 069. This historical plan is superseded by consolidation; continuing implementation, verification, and lifecycle belong to Plan 069.

### Expected hierarchy

`~` means modify; `+` means add. The SDK module's exact filename remains an open decision, so the browser subtree is listed rather than inventing an entrypoint.

```text
zerospin/
├── packages/core/src/
│   └── identity/~ types.ts
├── packages/system-worker/
│   ├── src/AggregateAccessApi/
│   │   ├── ~ AggregateAccessApi.ts
│   │   └── + executeCommand/executeCommand.ts
│   ├── src/AggregateApi/admit/admitAggregate/~ admitAggregate.ts
│   └── checks/~ aggregate-administration.mjs
├── packages/browser/
│   ├── ~ src/ (typed SDK entrypoint and exports to settle)
│   └── ~ checks/ (reuse the relevant existing seam)
└── wiki/
    ├── plans/~ 069-plan-rpc-call-stack-cleanup.md
    └── ~ affected existing architecture/module documentation after implementation
```

## QRK follow-up flow

1. Own registration in application session startup beside `apps/studio/components/ZerospinUser.tsx`. Authenticate through ordinary actor admission, execute `createUser`, and await authoritative creation or a classified existing-user result before initializing the ordinary `userSession`.
2. Keep startup explicit. Do not insert writes into `getCredentials`, mount a temporary replicated registration session, or rely solely on `/replace` or a signup redirect. Direct Studio entry must follow the same registration ordering.
3. Use the ordinary user actor for `createUser`; remove `userProvisionerV1` and its indirect authentication/provisioning path when migrating QRK. Authentication then only verifies Clerk and produces claims.
4. Add ordinary session authorization checking that the matching User exists. Creation/ownership/duplicate permissions remain in authoritative command guards. Preserve the existing independent User resource ID and Clerk-subject uniqueness unless the user separately approves changing that data model.
5. Preserve initial profile defaults and never overwrite an existing user's data during registration. Handle lost responses and concurrent first registrations through retained command identity and the existing domain uniqueness rule.
6. Keep registration failures visible and retryable before session initialization. Distinguish unknown transport outcome from a final business rejection; do not proceed based solely on an optimistic row or local acknowledgement.
7. Implementation of this follow-up requires its own agreed consumer scope, appropriate upstream package release, and exact dependency updates. None occurred here.

## Verification

1. Use real constructed actors and production procedures in the existing worker administration harness: valid credentials; callback rejection; malformed returned claims; exact actor/contract name/version ownership; rejection of substituted claims/aggregate identity, undeclared commands, and public external continuations; successful execution without a browser session.
2. Exercise authoritative guard denial, synchronous rollback, staging-before-execution where required, admission/execution failure distinctions, and final-result recovery. Prove that direct execution runs the same required guards as the session command path.
3. Verify SDK-owned IDs: one invocation and its transport retries carry the same ID and encoded occurrence; a separate invocation gets a distinct ID; a lost response cannot apply the same command twice. Do not test only a mocked function that echoes the submitted ID.
4. Verify public and inferred types for contract payloads and final results, and that application-facing execution requires neither a command ID nor a browser session. Authentication callback types must no longer expose command execution. Browser exports must not pull in server-only declarations or secrets.
5. Preserve existing session initialization, claims, snapshots/tickets, and actor-free administrative behavior. No fixed storage schema change is currently proposed. If implementation requires one, stop to settle the new scope and empty-storage requirement; do not erase storage implicitly.
6. Discover resolved Nx configuration before execution. Run scoped core/worker/browser typecheck and lint with required library dependencies; worker `aggregate-administration:check`; and browser `initialized-session:check` when the SDK/initialization seam changes. Include the React consumer typecheck/claims check when affected. Run scoped formatting and `git diff --check` without sweeping unrelated WIP.
7. QRK's existing `apps/zerospin/src/system.workerd.spec.ts` covers duplicate/lost-response/concurrent creation and is a follow-up migration reference, not proof that the proposed upstream direct SDK path works.

## Open decisions to settle before implementation

1. Exact SDK entrypoint and lifetime for the accepted `access.executeCommand({ contract, payload })` shape. Decide how the typed access object is acquired using the existing stateless `getApi` selector without treating a remote Cap'n Web stub as the public wrapper or shipping executable contracts over RPC. Check whether the browser package or a browser-safe core utility is the correct owner.
2. Concrete internal request/envelope and retry boundary. The SDK allocates one ID per logical invocation, but current `getApi` has no retry support. Specify what constitutes a retry of that invocation, where command construction sits outside repeated RPC execution, and how an unknown remote outcome is surfaced/recovered. Do not silently add automatic unbounded retries, another durable journal, or a second identity registry.
3. Bounded upstream caller/guard cutover needed to make direct invocation safe under the agreed permission model. Derive it from current source. Do not preserve the earlier operation-discriminator proposal or import Red Rope's existing admin design as a requirement.

## Remaining work

No independent work remains in this superseded document. All unfinished design, implementation, verification, and separately scoped QRK follow-up are recorded in [Plan 069](069-plan-rpc-call-stack-cleanup.md).
