# Plan 080: Architecture diagram readability

Status: Complete

## Problem and agreed scope

The source readability scan found hidden runtime ownership, workflows combining
unrelated lifetimes, generic participant names, incidental Explorer summaries,
and a duplicated aggregate-execution sequence. Address every finding across the
remaining architecture diagrams. Preserve the two browser startup pages from
plan 079 and the `App.tsx` caller label. Runtime behavior, APIs, schemas, and the
mermaid-flow renderer remain unchanged.

## Implementation

1. Focus browser worker bootstrap on worker selection and startup; group identity
   admission by runtime and distinguish resource authorization from snapshot loading.
2. Separate initialized-session publication from disposal, optional command
   validation from staging, and name the tab-owned reconciliation transaction.
3. Split alarm registration/scheduling from wake/recovery and service execution
   publication from actor projection and browser delivery.
4. Show the initiating browser socket push, admission receipt, and later final
   command delivery on aggregate and service admission pages.
5. Replace the duplicate System API execution sequence with capability acquisition
   and link to the canonical aggregate execution diagram.
6. Clarify Studio agent connection, durable subscriber catch-up, direct service
   execution, and current/candidate deployment roles. Add concise purpose paragraphs,
   runtime boundaries, source-named participants, and matching numbered steps.
7. Update Explorer participant metadata, page IDs, RPC links, source citations,
   frontmatter, and the wiki index. Remove obsolete IDs without compatibility routes.

## Planned files

`+` create, `~` modify.

```text
zerospin/
├── wiki/
│   ├── archive/plans/+ 080-plan-architecture-diagram-readability.md
│   ├── architecture/
│   │   ├── ~ AuthoredSystem.md
│   │   ├── ~ SystemApi.md
│   │   ├── browser/
│   │   │   ├── ~ bootstrapBrowserSession.md
│   │   │   ├── ~ Identity.md
│   │   │   ├── ~ AggregateCommandLifecycle.md
│   │   │   ├── ~ PushSequence.md
│   │   │   ├── ~ SessionWebSocket.md
│   │   │   └── ~ StandaloneSharedWorkerExecution.md
│   │   └── server/
│   │       ├── ~ admitCommands.md
│   │       ├── ~ admitServiceCommand.md
│   │       ├── ~ executeAggregateCommand.md
│   │       └── ~ serviceExecution.md
│   └── ~ index.md
└── explorer/
    ├── scripts/~ readArchitectureDiagrams.ts
    └── src/data/
        ├── ~ sequenceParticipantDetails.ts
        └── ~ rpc-method-explanations.ts
```

## Constraints and completion

1. Preserve concurrent and unrelated work. Use current source and existing glossary
   terms; this documentation change requires no new ADR or glossary concept.
2. Tests, builds, browser checks, and verification runs are excluded by the user's
   active yolo instruction. Source reads and citation-hash refreshes support authoring.
3. Complete and archive this plan when all authored changes and Explorer integration
   are finished. Do not claim rendered layout or validation was checked.

## Outcome

1. Addressed every readability finding with focused purpose summaries, explicit
   runtime ownership, numbered messages, and matching annotated steps.
2. Split initialization/disposal, validation/staging, alarm scheduling/recovery,
   service execution/delivery, and standalone startup/execution into focused pages.
3. Replaced the duplicate System API execution sequence with capability acquisition;
   clarified Studio’s tab-owned agent socket and the server-held administrative secret.
4. Migrated Explorer participant metadata, RPC links, catalogue headings/categories,
   and in-scope page anchors. Preserved the two online startup pages and App.tsx label.
5. Refreshed source hashes and documented the actual admission control fields and
   independent final-delivery timing. Runtime, API, schema, and renderer code are unchanged.
6. Tests, builds, browser checks, and verification runs were excluded and not run.
   Completion records authored implementation, without a rendered-layout claim.

## Remaining work

None.
