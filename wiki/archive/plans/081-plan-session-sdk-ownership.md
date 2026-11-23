# Session SDK ownership and lifecycle cleanup

Status: Complete. Approved and verified in chat on 2026-10-09.

## Scope and agreed behavior

1. Move service command execution into the stable session. The browser lifetime explicitly binds and revokes its execution capability; remove the module-level WeakMap and bridge exports. Preserve asynchronous durable Node acceptance.
2. Give aggregate and service sessions complete synchronous release transitions. Factories delegate to those transitions. Mock services publish `serviceIndex: 0`; released services clear it to `null`.
3. Cancel queued `onInitialized` delivery when its subscription is canceled or its initialization is released/replaced.
4. Give aggregate and service browser RPC subscriptions one acquired-lifetime owner. Replacement and disposal fence every callback, including callbacks from pending acquisition. Preserve deliberate sign-out notification and release each retained capability exactly once.
5. Type the bound service `stageCommand` by the selected contract, including its payload and decoded result. Keep the public function as delegation.
6. Make aggregate validation one lazy Effect program using the initialized runtime context, its invocation scope, temporary ID factories, and existing result normalization. Remove the redundant read adapter and nested interpreter.
7. Expose the standalone staged-command subscriber directly on its browser RPC capability. Validate the entire batch and its claims before accepting any command. Remove the connector facade and per-command public `accept` method; update its callers outright.
8. Make locally consumed failure/origin/executed-command schema helpers private. Retain shared helpers that own real evaluation, transaction, or codec invariants.
9. Expected failures remain returned failures. Unexpected live service preview exceptions reach the session reporter, emit once, and rethrow the original exception. Preserve `makeTx` transaction-failure normalization and all synchronous transaction boundaries.
10. Preserve unrelated work, existing durable command/storage schemas, and the unified failure stream. No compatibility aliases, migrations, or additional `ALLOWED_CAST` declarations.

## Planned files

`+` creates a file; `~` modifies a file.

```text
zerospin/
├── packages/core/src/
│   ├── ~ aggregateSession/{types.ts,make/makeAggregateSession.ts,validateSessionCommand.ts,makeSessionResult.ts}
│   ├── ~ serviceSession/{types.ts,make/makeServiceSession.ts,stageServiceCommand.ts}
│   └── ~ contracts/{AggregateCommandOriginSchema.ts,ExecutedCommandSchema.ts}
├── packages/core/
│   ├── ~ test/session-failures.node.spec.mjs
│   ├── + test/aggregate-session-lifecycle.node.spec.mjs
│   └── ~ typecheck/session-staging.typecheck.ts
├── packages/browser/src/
│   ├── ~ bootstrapServiceSession.ts
│   ├── ~ makeSession/makeSession.ts
│   ├── ~ makeServiceSession/makeServiceSession.ts
│   ├── ~ makeMockSession/{makeMockAggregateSession.ts,makeMockServiceSession.ts}
│   ├── ~ makeStandaloneSession/makeStandaloneSession.ts
│   ├── + Node/makeBrowserSessionSubscription.ts
│   ├── ~ AggregateNode/AggregateBrowserSessionApi.ts
│   ├── ~ ServiceNode/ServiceBrowserSessionApi.ts
│   └── ~ StandaloneNode/{StandaloneBrowserSessionApi.ts,connectStandaloneNode.ts}
├── packages/browser/
│   ├── ~ test/initialized-session.node.spec.mjs
│   ├── + test/browser-session-subscription.node.spec.mjs
│   └── ~ e2e/{standalone-fixture/main.ts,standalone-session.playwright.spec.ts}
└── ~ wiki/, explorer/src/data/invocation.ts
```

## Verification

1. Test live service expected refusal and unexpected preview exceptions, original exception identity, one failure event, durable acceptance, execution revocation, and typed direct staging.
2. Test service mock readiness metadata and complete release/reinitialization state for aggregate and service sessions.
3. Test cancellation between readiness publication and queued callback; fence disposed/replaced initialized state.
4. Test pending RPC acquisition, replacement, disposal, late callbacks, failed registration, and exactly-once retained/source cleanup for both browser session domains.
5. Test standalone batch validation, claims isolation, receipts, repeated commands, stale/reset capabilities, and removal of `accept`/connector facade.
6. Retain validation laziness, temporary IDs, acquired application services, scope cleanup, declared failures, and synchronous-program enforcement.
7. Run scoped Nx core/browser node tests, core/browser/React TypeScript and lint, React `claims:check`, relevant standalone browser verification, and formatting on changed files. Inspect the final diff and affected source citations.
8. Reconcile implemented lifecycle terminology and affected workflow documentation. Record the outcome and archive this plan after all required checks pass. No new ADR is required for these repairs.

## Outcome and evidence

1. Implemented all eight findings. Service execution is bound to the stable session without a global registry, staging retains selected-contract inference, and live unexpected preview exceptions report once and rethrow their original exception. Aggregate validation remains lazy and scoped while using acquired application services without a nested interpreter.
2. Core sessions own complete synchronous release. Readiness delivery is cancellable after queuing and fenced by initialization lifetime. Browser RPC subscriptions share retained-sink/source ownership across aggregate, service, and standalone capabilities. Standalone exposes the named staged-command subscriber directly and validates the whole batch before acceptance.
3. The coordinated Nx graph passed core node tests (16), browser node tests (30), both Playwright fixtures (2), React `claims:check`, and core/browser/React `ts` and `lint`. A follow-up lint graph rebuilt core/browser and passed after removing every warning introduced by this change. Existing unrelated lint warnings and unavailable Nx Cloud remote caching were preserved.
4. Formatting passed for all 27 changed SDK files, the four affected browser workflow pages, invocation data, glossary, and local pattern. The affected AuthoredSystem session lifecycle section is formatted; unrelated deployment-section formatting from concurrent architecture work was preserved. `git diff --check` passed. Verified 54 changed-source metadata/citation ranges, seven matching message/annotation pairs, and no missing links in the five affected workflow pages.
5. Updated the lifecycle glossary, session ownership pattern, workflow diagrams, and Explorer invocation description. Preserved concurrent architecture work and the separately authorized removal of the aggregate staging wrapper and its callers. No storage schema, migration, compatibility path, or cast exception was introduced.

## Remaining work

None.
