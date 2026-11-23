# Independent agent releases and durable Agent Node Repo upgrades

**Status:** Complete. Approved, implemented and verified on 2026-10-25.

## Design contract

Register immutable `system.agents[agentName][agentVersion]` releases and exactly
one explicit `system.agentVersions[agentName]` pin. A stable Agent Node Repo
survives release changes; only the configured release materializes new selected
history and schedules commands. Releases under one name retain the same owner
family and owner name, while owner version may change. No latest-version fallback,
compatibility path, agent state migration callbacks, or new retirement coordinator.

## Approved implementation

- Replace Node definition authoring with `makeAggregateAgentRelease`,
  `makeServiceAgentRelease`, their I-prefixed types, schemas and predicates;
  constructors receive `agentRelease`. Each release has `agentVersion`.
- Validate nested registry names/versions, all exact owner bindings, and one pin
  per name. Portable SystemSpec includes mutable pins, but immutable acceptance
  uses one `agentRelease` identity keyed by `(agentName, agentVersion)`.
- Consolidate scoped prerequisites into `agentReleases`; resolve exact aggregate
  and service releases synchronously and fail on missing required declarations.
- Add agentVersion to versioned Agent Repo/Chain identities, fanout subscriber
  identities/cursors, Node Repo checkpoints, Agent Origin, outbox producer
  provenance, observer locks, requests, tickets, sockets and bootstrap checks.
  Stable Node Repo identities stay unchanged. Preserve producing Agent Origin
  independently of the receiving Agent projection's release.
- Refactor Node runtime to one advancement routine for explicit initialize and
  alarms. Constructor activation only schedules durable recovery. Derive
  transition state from checkpoint and outbox; do not persist a phase enum.
- Before changing selected state, deliver commands already in
  commandDeliveryOutbox using exact stored input. Delete only after an exact
  admission receipt; this does not prove execution commit or retained outcome.
- Capture the configured projection's command-derived snapshot outside a local
  transaction, then atomically replace selected resources, checkpoint and wake
  reconciliation after checking unchanged state and empty outbox.
- Subscribe after baseline commit using catch-up/enrollment. An ephemeral
  needsEnrollment flag retries after restart without reinstalling a matching
  baseline. Receive transactions validate complete source/head bindings and do
  not acquire the cycle lock held by subscribe/catchup.
- Preserve independent outbox delivery on selected-sync failure, one WakeRegistry
  alarm owner, and retries for absent/mismatched heads and incomplete enrollment.
- Qualify attempted wakes by behaviorKey/modelName/resourceId. Preserve matching
  selected attempts across upgrades; changed behavior keys intentionally permit
  fresh attempts. Removing wake behavior remains a valid release transition.
- Initialize scheduled configured releases plus previously registered Node Repos
  for still-configured agents, deduplicated through SystemRepo.repos. Do not
  eagerly create Node Repos for new observation-only releases; transitioned
  observation-only Nodes become dormant after pending delivery completes.
- Restrict owner fanout to configured agent release identities. Inactive views
  retain rows/cursors/history and finish complete pending selected publication;
  their Chain stops delivery to the stable Node Repo.
- Observation requires exact requested agentVersion matching the configured pin.
  Reject inactive observer connect/resume/message; never silently retarget.
  Previously issued tickets retain their exact stored routing identity.
- Update SDK/browser, Shopping, Studio, CLI, harness, existing tests and stories,
  authoring guidance, glossary, patterns and governing ADR clauses together.

## Storage cutover

Inventory physical schema and codec changes, including Agent Origin in canonical
commands, operations, external continuations and tickets. Changed fixed formats
require empty affected development storage. Persistent resets require separate
explicit authorization. Do not add translation migrations or change the existing
forward-only SQL migration engine or contract payload adapters. Package publication,
external consumer repositories and production deployment are outside scope.

## Affected storage inventory

No persistent storage has been reset. The fixed-format cutover requires empty
affected development storage before running the changed code against it:

- SystemRepo: acceptedDefinitions keys/specs and stored WebSocket ticket admissions.
- AggregateAgentNodeRepo / ServiceAgentNodeRepo: materializationHead,
  commandDeliveryOutbox and attemptedAgentWakes physical schemas.
- AggregateVersionChain / ServiceVersionChain: Agent subscriber name/version
  uniqueness and retained evaluated commands containing Agent Origin.
- AggregateChain / ServiceChain: `commands.origin`, recorded commands in
  `commandDeliveryOutbox.command`, and `externalOperationOutbox.origin`.
- AggregateVersionRepo / ServiceVersionRepo: `aggregateVersionChainOutbox` /
  `serviceVersionChainOutbox` retain complete evaluated commands and their Origin.
- Agent Version Repo/Chain namespaces: physical instance names now include
  agentVersion; do not reuse old physical instances under the new key shape.
- Actor projection/publication rows retain selected deltas and private Actor
  completion, not Agent Origin; this change alone does not require resetting
  their unchanged tables. Physical SQL equality is still insufficient for the
  explicitly listed Origin-bearing JSON fields.
- Browser Agent observation databases are transient and reopened with the exact
  authored release; no persistent browser/native reset is authorized here.

A persistent-environment cutover must enumerate its concrete systemId and Repo
instances from inspection before asking for separate reset authorization. Disposable
Workers test storage is reset only by the existing test lifecycle.

## Verification

Extend existing tests only, with inline declarations rather than new fixtures.
Prove immutable acceptance and mutable pins; independent same-owner upgrades;
pending-command/lost-receipt recovery; restart at delivery/snapshot/commit/enrollment
failure points; distinct projection identities/cursors; inactive publication
recovery; observer/source binding safety; model-qualified wake continuity;
scheduled-to-observation-only transitions; Aggregate/Service and harness parity.
Run focused Nx test filters with compiler/library dependencies, then the existing
suite and scoped lint/type/build and relevant Studio checks. Never verify Explorer.

## Implementation and verification evidence

- Implemented independent release authoring/validation, exact immutable acceptance,
  active-only projection identities, recorded Agent producer provenance, durable
  Node transitions, dormant registered-node recovery, and exact observer bindings.
- Migrated SDK/browser, Shopping, Studio, declaration-board consumers, current
  tests/stories and authoring guidance without compatibility aliases.
- `pnpm nx run zerospin:test -- --maxWorkers=2` passed: **145 tests across 33 files**,
  including the complete test compiler check and dependency libraries. Failure
  injection covers pending delivery, lost receipts, snapshot/enrollment failures,
  restart without baseline rewind, and scheduled-to-observation-only transition.
- Aggregate upgrade coverage proves independent v1/v2 cursors and that a new
  admitted command advances only v2 while retaining v1's acknowledgement.
- `pnpm nx run-many -t lib,lint,ts` for the eight affected projects passed, including
  their required dependencies. Final `system-worker:lint` passed without warnings.
- `@zerospin/studio:build-storybook` passed with the migrated fixtures and bundle.
- Architecture source sections, lifecycle sequence/annotations and citation ranges
  were reconciled with the implemented release ownership and recovery paths.
- Formatting and `git diff --check` passed for task files. Three existing Shopping
  SharedWorker URL-import lint warnings remain in unchanged components. Nx Cloud
  remote-cache access/network warnings did not affect local task success.
- Dependency installation restored the existing lockfile without modifying it.
  No persistent storage, production deployment, package publication or external
  consumer repository was changed. Disposable test storage used existing resets.

## Remaining work

None.
