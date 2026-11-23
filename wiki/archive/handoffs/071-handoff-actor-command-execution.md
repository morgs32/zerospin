# Handoff: actor command execution before a browser session

**Date:** 2026-10-08
**Status:** Superseded by consolidation into [Plan 069](../plans/069-plan-rpc-call-stack-cleanup.md) on 2026-10-08. No feature implementation occurred in this handoff. All remaining actions and useful pointers have moved to the active plan.

## Goal

Continue [Plan 069](../plans/069-plan-rpc-call-stack-cleanup.md), the sole active plan containing the decisions, rejected designs, QRK follow-up, source findings, verification requirements, and SDK/retry questions from this handoff. [Plan 071](../plans/071-plan-actor-command-execution.md) is retained as a superseded historical record.

## Done

1. Behavioral direction is agreed and captured in the plan. No source implementation, package update, consumer adaptation, or feature test execution occurred here.
2. QRK was inspected and confirmed to be a real consumer of authentication's current command callback. Its concrete files and retry/duplicate tests are listed below; do not assume the callback is unused merely because examples, Explorer, and Red Rope did not use it.
3. Plan 070 remains archived as completed. The user subsequently requested one plan; this handoff's receiving context and remaining actions are now incorporated into Plan 069.

## Remaining

No independent work remains in this handoff. SDK/transport decisions, upstream implementation/checks, and separately scoped QRK follow-up continue in [Plan 069](../plans/069-plan-rpc-call-stack-cleanup.md).

## Suggested skills

1. `$spec` — resolve only the remaining concrete SDK/transport choices, without restarting the behavioral discussion.
2. `$rubber-duck` — examine whether a proposed wrapper or retry abstraction earns its interface; the user rejected unnecessary authorization machinery.
3. `$use-morgs32-wiki-patterns` — current source/ownership, Effect, transaction, guard, public type, and scoped execution conventions.
4. `$nx-workspace` and `$nx-run-tasks` — resolved project/check configuration and scoped verification with dependencies.
5. `$implement` — complete implementation, required verification, documentation, and the plan's lifecycle when authorized.

## Pointers

1. `wiki/archive/plans/071-plan-actor-command-execution.md`
2. `wiki/plans/069-plan-rpc-call-stack-cleanup.md`
3. `wiki/archive/plans/070-plan-required-aggregate-authentication.md`
4. `wiki/archive/plans/068-plan-aggregate-session-authorization.md`
5. `packages/core/src/utils/getApi/getApi.ts`
6. `packages/core/src/contracts/make/makeCommand.ts`
7. `packages/system-worker/src/AggregateAccessApi/AggregateAccessApi.ts`
8. `packages/system-worker/src/AggregateApi/admit/admitAggregate/admitAggregate.ts`
9. `packages/system-worker/src/AggregateProjectionRepo/stageDirectAggregateCommand.ts`
10. `packages/system-worker/src/AggregateChain/executeAggregateCommand/executeAggregateCommand.ts`
11. `packages/system-worker/src/AggregateVersionRepo/execute/execute.ts`
12. `../qrk.sh/apps/zerospin/src/aggregates/user/actors/userActorV1.ts`
13. `../qrk.sh/apps/zerospin/src/aggregates/user/actors/userProvisionerV1.ts`
14. `../qrk.sh/apps/zerospin/src/aggregates/user/contracts/createUser/CreateUserV1.ts`
15. `../qrk.sh/apps/zerospin/src/system.workerd.spec.ts`
16. `../qrk.sh/apps/studio/components/ZerospinUser.tsx`
17. `../qrk.sh/apps/studio/zerospin/userSession.ts`

## Open decisions

1. Plan 069's **Open decisions to settle before implementation** is authoritative. The user approved the behavioral direction and requested this plan/handoff; do not present the unchosen SDK construction/retry details as approved implementation.
2. The former restriction to a separate side conversation is superseded by the explicit consolidation request. Plan 069 contains the continuing scope and decisions; consolidation itself is not feature implementation approval.
3. The earlier pending question about a command/session discriminator was superseded by the user's rejection. Do not wait for an answer to it or reintroduce that model.
