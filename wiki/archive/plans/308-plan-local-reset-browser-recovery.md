# 308 — Local reset browser recovery

**Status:** Complete 2026-11-16. Automated verification passed; the user performs manual browser verification independently.
**Scope:** Connected browser AggregateNode and ServiceNode recovery after a whole-System reset in local development.

## Problem

1. `zerospin dev --clean` already removes the configured local System's Wrangler persistence before the new dev Worker starts. Connected browser Nodes and tab journals can outlive that reset.
2. A Node with no admitted commands can have checkpoint zero and a pending first command. Today an absent `nodeProducers` row is treated as a new producer, so the fresh AggregateChain or ServiceChain can admit that stale command. Checkpoint validation alone does not distinguish it from a new Node.
3. Existing connected recovery requires a recognized failure. It may preserve pending commands and does not reliably recognize this reset before delivery.

## Agreed behavior

1. A reset is a **whole-System reset**. Independent Aggregate or Service history resets are unsupported. `zerospin dev --clean` remains the developer entry point; add no reset CLI or public reset API.
2. A local development System reset discards its old System history. Each affected connected browser detects the reset itself, discards its own old Node state and pending commands, and initializes from a fresh authenticated baseline. The CLI does not inspect or clear browser profiles. Application-owned drafts, authentication, cookies, other Systems, and external resources are outside this reset.
3. A normal reconnect, dev Worker restart, deployment, offline period, authentication failure, unavailable System, or unrelated admission failure is not evidence of reset and must not discard local state.
4. Existing local-dev Nodes with no matching producer record on the first upgraded connection are treated as stale and cleared, including pending commands, even when their System has not been reset. Existing Nodes with a matching record can retain their work. This one-time rule does not authorize clearing production or remotely hosted dev storage.
5. Preserve ordinary offline access to previously established Nodes. A reset cannot be recognized while offline; its old local view may remain visible until authenticated reconnection. Before any retained command can be admitted against the fresh System, the browser must resolve registration and discard the obsolete work.
6. No execution in this plan is authorization to reset any existing System or browser storage. Verification uses isolated, explicitly authorized local data.

## Design

1. Reuse each owner Chain's `nodeProducers` record. Register a new connected Actor Node with its exact owner release, session, Actor, claims and `nodeId`, and `lastPushIndex: 0` before the Node can stage work that might later be submitted. The first admitted command advances that same record to `1`. Registration is bookkeeping; it does not create model data or a command.
2. Persist registration through the existing Node baseline: a fresh Node installs its first baseline only after its producer registration succeeds. A Node with an installed baseline checks the matching server record and exact binding; a missing record is not silently recreated. A confirmed missing record in an authenticated local-development System selects fresh-Node recovery. Binding mismatches, malformed state, network failures and authentication failures remain errors, not reset signals.
3. Make initial registration retryable and idempotent for the same Node and binding. Fence new staging until registration is durably established on both sides. A Node without a baseline and without retained commands can retry its initial registration; an interruption after server registration but before baseline installation therefore needs no additional browser storage field. A reset during that interval must not allow old staged work to be submitted. Do not treat a newly created, never-registered Node as a missing previously registered Node.
4. Preserve the first-upgrade decision: for existing local-dev Nodes, check the actual producer row before importing or submitting old journal entries. If missing, clear that Node even if it had never submitted a command. If present and the full binding matches, retain and reconcile its existing work. Address existing nonlocal Nodes without silently clearing them or weakening the existing connected-storage upgrade guarantees.
5. Fence admission, not just browser startup: an old tab or an in-flight socket must not cause the fresh local System to create a missing producer implicitly and admit its old command. Validate the established registration and binding at the trusted owner Chain admission point. Preserve independent Agent and System admission paths, existing authorization, and genuine new-Node registration.
6. Reuse the SharedWorker's namespace lease, attachment coordination and generation fencing. Stop and join old synchronization and delivery callbacks before replacing a Node; obtain and validate a fresh authenticated baseline; rotate Node identity; clear affected Session replicas, staged-command journals and in-memory pending work so they cannot be re-imported. Scope deletion to the obsolete Node and its session identity, including work from multiple tabs. If cleanup cannot be completed safely, remain failed or fenced rather than admitting old work.
7. Distinguish local development from a remotely hosted deployment at a trusted runtime boundary. The existing `environment: 'dev'` value alone does not establish locality. Only an authenticated, explicitly local-development context may authorize automatic reset cleanup; do not add a remotely callable destructive reset capability. Keep production and remote development recovery non-destructive on a missing record.
8. Keep the existing connected storage upgrade history and supported forward-only migration policy. Do not drain stale work before the reset check. Reuse the existing baseline state rather than adding a browser schema migration; an unknown or newer format must never fall through into destructive reset recovery.
9. A System-wide storage identifier, a cryptographic capability, a second browser registry, and automatic cleanup on every restart were considered. The agreed design uses the existing owner-local Node producer relationship, preserving offline behavior and avoiding a separate System-wide identifier.

## Examples

1. Fresh Node: authenticate -> register producer at `0` -> persist browser registration -> stage and admit first command at `1`.
2. Offline then reset: a registered Node stages command `1` offline -> developer runs `zerospin dev --clean` -> Node reconnects -> its producer record is missing -> browser discards the old Node and journal -> a new Node registers at `0`. Command `1` is never admitted.
3. Ordinary restart: the producer record remains -> exact binding matches -> browser retains its Node and pending commands and resumes normal delivery.
4. Interrupted first registration: the browser cannot stage an unregistered command; retry reuses the same Node and binding. A lost response or System reset during this interval must not convert old staged work into a newly registered producer.

## Implementation steps

1. Trace both families' authenticated snapshot, session ticket, Node bootstrap, journal import, socket resume and owner Chain admission paths. Confirm the first durable local registration point, exact local-development signal, all staging gates, and any other Actor admission paths. Record the concrete protocol and locality proof before editing; do not treat a dev environment label as proof of local execution.
2. Add authenticated early registration and established-Node lookup to AggregateChain and ServiceChain, reusing the existing producer rows and exact binding checks. Make registration idempotent and enforce the missing-registration fence for local-development Actor submissions at admission. Keep authorization independent of the Node's reset status.
3. Use the connected Node's existing durable baseline as the local registration boundary. Sequence fresh registration, baseline installation, offline eligibility, first-upgrade handling and retry so no stale command can be submitted during any transition. Retain existing production and remote state on uncertain or missing evidence.
4. Teach Aggregate and Service connected synchronization and startup to recognize the authenticated local reset result before staged-journal import or command push. Reuse existing recovery ownership but take the fresh-Node path for this result, never the preserving-repair path. Fence all tabs and old callbacks; discard only the obsolete Node's pending journal entries and replicas; install a new baseline and register the replacement Node.
5. Extend existing focused backend and browser verification at the seams below. Run the affected existing package checks. Do not create new test files, fixtures, runners or configuration without separate authorization.
6. After implementation, reconcile [the glossary](../../glossary.md), connected-session architecture and installed browser guidance with actual behavior. Create or update an ADR only if the implemented decision is hard to reverse, surprising without context, and reflects a real trade-off. Existing context: [ADR 003](../../adrs/003-immutable-node-command-history-and-submission-order.md), [ADR 027](../../adrs/027-connected-browser-node-storage-upgrades.md), [Plan 283](./283-plan-connected-session-recovery.md), and [Plan 293](./293-plan-connected-node-storage-upgrades.md).

## Verification

1. Extend existing owner Chain admission tests for registration at zero, exact binding, idempotent retry, first command, and missing registration refusing an old command. Exercise Aggregate and Service; preserve non-Actor admission.
2. Extend the existing Aggregate and Service browser host scenarios: first-command offline across an actual whole local-System reset; ordinary restart with pending work; matching and missing legacy producer records; a fresh never-registered Node; lost registration reply; stale socket delivery; and multi-tab journals. Assert old work cannot be re-imported or admitted and a new command works after recovery.
3. Verify offline, authentication, transport and remote/production missing-record cases preserve local work. Verify interrupted cleanup and unsupported/newer storage cannot trigger unsafe fallback. Check that supported storage upgrades retain their existing guarantees.
4. Run focused browser, core and System Worker tests and relevant type/lint checks through the existing workspace targets. Have the user perform any required manual local browser verification under the day's recorded verification choice. Do not claim browser or real reset behavior from unit tests alone.

## Planned file hierarchy

Legend: `+` create; `~` modify. Grouped directories identify existing owners; final exact files follow the traced paths above.

```text
zerospin/
├── packages/
│   ├── browser/
│   │   ├── src/
│   │   │   ├── AggregateNode/                         ~
│   │   │   ├── ServiceNode/                           ~
│   │   │   ├── Node/                                  ~
│   │   │   └── stagedCommandJournal/                  ~
│   │   ├── tests/aggregate-host.browser.ts            ~
│   │   ├── tests/service-host.browser.ts              ~
│   │   └── skills/zerospin-browser-sessions/           ~
│   ├── core/src/
│   │   ├── AggregateNode/                             ~
│   │   ├── ServiceNode/                               ~
│   │   ├── aggregateSession/                          ~
│   │   └── serviceSession/                            ~
│   ├── cli/src/dev/                                   ~ (only if needed for local context)
│   ├── cli/README.md                                  ~
│   ├── dev-worker/src/makeWranglerConfig.ts            ~
│   ├── native/src/openAggregateNativeNodeOwner.ts      ~
│   └── system-worker/
│       ├── src/AggregateChain/                        ~
│       ├── src/ServiceChain/                          ~
│       ├── src/aggregateSessionChain/                 ~
│       ├── src/ServiceActorVersionChain/              ~
│       ├── src/AggregateSessionApi/                   ~
│       ├── src/ServiceSessionApi/                     ~
│       └── tests/                                     ~
├── scripts/lint/zerospin-plugin.mjs                    ~
└── wiki/
    ├── archive/plans/308-plan-local-reset-browser-recovery.md  +
    ├── architecture/browser/                         ~
    └── glossary.md                                    ~
```

## Implementation and verification status

1. The isolated `codex/local-reset-browser-recovery` checkout implements local producer registration, browser-owned reset recovery, journal deletion, admission and socket fences, and fresh Native Aggregate registration without automatic Native storage deletion. The local Node baseline serves as the durable registration boundary; no Node storage schema is added.
2. The final focused Node and Workerd run passed **178 tests across 27 files**, including producer registration, admission fencing, and Aggregate/Service socket resume. The affected package lint targets passed with pre-existing warnings. Native typecheck passed.
3. With the user's approval, corrected two existing continuation assertions: a successful admission includes `destinationIndex`, while replaying the same position with a changed payload reports `aggregate-recorded-command-conflict`.
4. Aggregate and Service browser reset scenarios were added to the existing browser fixtures and compiled, but have not been executed in a browser. The user chose to perform manual browser verification on their own time. No package release, consumer update, or real storage reset was performed here.
5. Reconciled the existing glossary, connected-session architecture, browser skill and CLI guidance. No ADR was created: the local-development registration choice does not meet all three ADR criteria.

## Remaining work

None. The user owns the separate manual browser check.
