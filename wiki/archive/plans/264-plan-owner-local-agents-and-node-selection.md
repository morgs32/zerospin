# Owner-local Agents and explicit Node selection

**Status:** Complete. Approved, implemented and verified on 2026-10-25.

## Design contract

Declare Agents beside Actors inside Aggregate and Service releases. Changing an
Agent registered in a release requires a new owner composition version; unchanged
Agent declarations retain their versions and can be reused across owner releases.
This supersedes Plan 262's unchanged-owner Agent composition upgrades.

```ts
const userV2 = makeAggregateRelease(User, {
  version: 2,
  models: { account: accountV1 },
  contracts: { expireAccount: expireAccountV1 },
  actors: { customer: customerActorV1 },
  agents: { expiry: expiryAgentV2 },
});
const system = makeSystem({
  name: 'shopping',
  aggregates: { user: { 1: userV1, 2: userV2 } },
  services: { promotion: { 1: promotionV1 } },
  aggregateAgentNodes: { user: { expiry: userV2 } },
  serviceAgentNodes: { promotion: { expiry: promotionV1 } },
});
```

## Implementation

- Add optional, frozen `agents` maps to owner releases, preserving literal types.
  Agent factories remain family-specific, but declarations omit system and owner
  names/versions. Owner factories validate canonical Agent dependencies.
- Capture complete, detached, recursively frozen owner-free Agent specs in their
  factories. Embed them in complete owner specs, including historical payload
  schemas; executable functions remain outside portable-spec immutability.
- Replace global Agent registries and version pins with optional owner-scoped
  Aggregate and Service Node maps containing canonical registered owner releases.
  Project selections as `{ aggregateVersion }` / `{ serviceVersion }` references.
- Accept independent Agent locks under explicit Aggregate/Service identities
  including owner name, Agent name and Agent version, excluding owner version.
  Delete the global stable-owner scan. Preserve atomic acceptance and exact full
  comparisons. Registration requires complete enclosing releases, with only
  Aggregate and Service spec groups and unchanged metadata transactions.
- Every declared Agent projection may materialize and serve observers regardless
  of Node selection. Owner Chains resolve subscribers from their bound release.
  Only selected Agent/owner versions deliver to the stable automation Node.
- Preserve frozen command input, original Agent Origin, owner/contract versions,
  exact admission receipts and synchronous commits. Drain before switching Node
  baselines. Removing a binding stops production, drains pending commands, then
  becomes dormant while retaining resources/checkpoints/attempted-wake markers.
  Keep required declarations until draining completes. Do not persist a phase.
- Recover configured scheduled Nodes and registered Nodes with transition/drain
  work. Observation does not create automation Nodes. Keep explicit family
  storage/delivery entrypoints and one WakeRegistry per DO.
- Browser Agent sessions receive explicit owner name/version beside the Agent
  declaration. Preserve exact bootstrap/resume/capability binding. Replace
  `openAgentSession` with `openAggregateAgentSession` and
  `openServiceAgentSession`, each returning `{ snapshot, ticket }` and accepting
  complete owner/Agent identity. Aggregate requests also include Aggregate ID.
- Issue session tickets only after complete enclosing-release comparison;
  spending retained tickets does not compare fresh specs. Keep permission at
  ingress and frozen retry input independent of current selection.
- Update repository-local browser/SDK/native adapters, harnesses, Shopping,
  Studio stories/fixtures, diagrams and documentation without compatibility paths.

## Verification

Extend existing tests and compiler assertions only. Prove owner-local duplicate
Agent names; typed selection rejection; complete and cross-release spec locks;
atomic metadata/acceptance behavior; independent observation and selected-only
automation; exact retry/restart/switch/removal/reselection; exact session context;
and pending publication recovery.

Run scoped Nx library/lint/available typechecks for changed packages and affected
repository consumers, then the complete existing suite with bounded concurrency
and Studio's Storybook build:

```sh
pnpm nx run zerospin:test -- --maxWorkers=2
pnpm nx run @zerospin/studio:build-storybook
```

## Documentation and cutover

Reconcile the glossary, current architecture/patterns, overlapping Plan 157
requirements and governing ADR clauses. Add a successor ADR for the revised
composition decision. Archive this plan only after verification completes.

Accepted-spec keys/content require empty affected SystemRepo storage. Preserve
command/checkpoint/outbox/ticket/Chain formats. No compatibility readers,
migrations, persistent resets, publication, external consumer changes or deployment
are authorized by this implementation.

## Implementation and verification evidence

- Implemented owner-local Agent composition, typed Aggregate/Service Node maps,
  owner-free frozen Agent specs and complete enclosing-release registration.
- Replaced global Agent lookup/pins and overloaded session opening with explicit
  owner-bound declaration resolution and Aggregate/Service session methods.
- Preserved frozen command bytes and durable Node formats; binding removal drains
  commands, reconstructs dormant and permits reselection. Declared projections
  and observers remain independent of automation selection.
- Updated repository-local consumers, current architecture and source citations,
  glossary, patterns and Plan 157. [ADR 022](../../adrs/022-owner-local-agents-and-explicit-node-selection.md)
  supersedes ADR 021's composition/selection model while preserving delivery rules.
- `pnpm nx run-many -t lib,lint,ts` passed for eleven scoped projects and their
  dependencies. The final System Worker library/lint/typecheck run passed without
  changed-file lint diagnostics. Existing warnings in unchanged files remain.
- `pnpm nx run zerospin:test -- --maxWorkers=2` passed: **147 tests across 33 files**,
  including the complete test compiler check. Coverage includes exact retries
  after binding removal, dormant reconstruction/reselection, cross-owner Agent
  identities and observation of unselected releases.
- `pnpm nx run @zerospin/studio:build-storybook` passed.
- Scoped formatting, `git diff --check`, and affected source citation/hash checks
  passed. Unrelated pre-existing TraceExplorer documentation references were
  preserved. No new test files, fixtures, runners or configuration were created.
- Workers verification used the existing disposable test lifecycle with localhost
  access. Nx Cloud access/network warnings did not prevent local verification.
  Persistent storage, package publication, external consumers and deployment were
  untouched. The SystemRepo empty-storage cutover still needs separate authorization.

## Remaining work

None.
