# Handoff: Session execution gating and optimistic projection

**Status — 2026-10-27:** Archived as superseded by completed
[Plan 271](../plans/271-plan-remove-connected-session-command-execution.md),
which removed connected-browser `executeCommand`, and completed
[Plan 270](../plans/270-plan-contract-release-names-and-command-kinds.md).
The proposed execution gates, pending fields and private outcome interfaces
serve that removed feature. Current Node optimistic replay already requires
staging evidence. **Remaining work: none.**
The focus, pickup instructions and open decisions below are historical
exploration, not an implementation queue or unresolved current decisions.

**Date:** 2026-10-26
**Focus:** Finish the design discussion about canonical-only execution, session
command availability, and excluding unstaged input from optimistic replay.

**Superseded direction, 2026-10-26:** The maintainer now wants connected browser
sessions to have no `executeCommand`. The execution/gating proposals below are
historical exploration, not a reexecution queue. Follow
[Plan 271](../plans/271-plan-remove-connected-session-command-execution.md) and
the [archived reset/reexecution handoff](2026-10-26-handoff-uncommitted-work-reexecution.md).
Ordinary staging, Node delivery and administrative execution remain separate.

## Goal

Continue the design interview, resolve the open session behavior, and then revise
the relevant portion of Plan 270 after the user confirms alignment. Do not treat
the proposed store fields or staging prohibition as approved implementation.

## Done

1. Investigated `makeAggregateNodeOptimisticView.ts`, its Service counterpart,
   shared projection machinery, session stores, submission preconditions, and
   installed-view evidence. Findings and source citations are in the research
   note linked below; reuse that evidence rather than repeating the investigation.
2. Explained the existing `Effect.void` branch: the optimistic view receives all
   pending Node commands and silently skips commands with null staging evidence.
   Proposed moving eligibility selection before the view and narrowing its input
   so its replay callback always replays.
3. The user questioned whether staging should instead be prevented while an
   `executeCommand` submission is unresolved, explicitly leaving that up for
   debate. They then asked about a session-store property for the outstanding
   command, terminology, and observable offline execution availability.
4. Saved the source-grounded research note. This side conversation made no source
   changes, ran no application verification, and created no implementation plan,
   glossary changes, or ADR. Parent-thread source changes remain separate WIP.

## Remaining

1. Resume with the last unanswered question: should one session permit only one
   unresolved new `executeCommand` submission, while allowing online
   same-ID/same-input retries? Recommendation was yes; the user has not answered.
2. Resolve the other material decisions below, one question at a time. Preserve
   the distinction between retained work, the caller's wait, canonical outcome,
   and the locally installed view.
3. After the user confirms shared understanding, update existing Plan 270 rather
   than creating a duplicate plan or a new spec. Include the intended file
   hierarchy, a bounded existing-file verification strategy, and
   post-implementation documentation reconciliation.
4. Implement only when authorized. Preserve the parent's unrelated WIP and
   research. Do not advance admission-schema consolidation or Plan 270 phase 3
   merely because this follow-up belongs to that plan.

## Suggested skills

1. `$grill-me` — finish unresolved behavior and obtain shared understanding before
   writing the plan.
2. `$rubber-duck` — keep the discussion terse and reason from requirements rather
   than defending the current machinery.
3. `$yolo` — reconsider implementation and ownership freely while preserving
   chosen requirements; no compatibility paths or storage-reset authorization is
   implied.
4. `$use-morgs32-wiki-patterns` — consult the local index and relevant shared
   guidance, especially command lifecycle and coordination cost.
5. `$implement` — use after implementation is authorized; complete the agreed
   scope and permitted verification.

## Pointers

1. [Research note](../../research/session-command-availability-and-canonical-execution.md)
2. [Plan 270](../plans/270-plan-contract-release-names-and-command-kinds.md)
3. [Governing ADR 023](../../adrs/023-flat-command-origins-and-claims-free-continuations.md)
4. [Glossary](../../glossary.md)
5. [Aggregate optimistic-view adapter](../../../packages/core/src/AggregateNode/makeAggregateNodeOptimisticView.ts)
6. [Service optimistic-view adapter](../../../packages/core/src/ServiceNode/makeServiceNodeOptimisticView.ts)
7. [Shared optimistic view](../../../packages/core/src/Node/makeNodeOptimisticView.ts)
8. [Root instructions](../../../AGENTS.md)

## Open decisions

1. **Execution concurrency:** one unresolved submission per calling session, or
   multiple? A singular proposed `pendingExecution` field depends on the answer.
   Same-ID recovery must not be mistaken for a second new submission.
2. **Staging exclusion scope:** the calling session, or every session attached to
   its Node? Recommendation was the calling session. A Node-wide prohibition
   needs an explicit concurrency design because staging is synchronous in each
   session before Node handoff. The user has not selected either scope.
3. **Release evidence:** recommendation was to resume staging after B's final
   evidence and corresponding view are installed locally, for both canonical
   Success and Failure. Neither aborting the caller's wait nor receiving its
   private outcome alone proves this. This recommendation is not yet approved.
4. **Store interface and terminology:** proposed fields are
   `pendingExecution: { id, contractName } | null`, `canStageCommand`, and
   `canExecuteCommand`. Derive them from journal, lifecycle, and connection facts;
   do not independently toggle redundant flags around a Promise. The command
   remains an Actor command; “canonical-only execution” distinguishes the path
   without inventing a new command kind. Names and public placement remain open.
5. **Availability and lifecycle:** known-offline entry is already rejected in
   current code and the user explicitly wants calls unavailable offline. Decide
   push-pause behavior, definitive admission refusal, identity replacement,
   disposal, and recovery without clearing retained work merely because waiting
   ended. Recommendations and current evidence are in the research note.

## Scope and pickup cautions

1. This is a side-conversation handoff. Inherited parent messages were reference
   context, not authorization to resume its reviews, agents, or outstanding
   implementation. The side conversation prohibits subagent interaction.
2. No commits, publication, deployment, storage resets, chat archival, worktree
   removal, or source edits are authorized by this handoff request. Do not alter
   the source plan's status or archive it while creating this handoff.
3. Follow root `AGENTS.md`: preserve unrelated WIP; never verify Explorer; create
   no test files, fixtures, runners, or test configuration without explicit user
   authorization. Prefer a small meaningful addition to an existing test seam
   if the eventual approved change requires it.
