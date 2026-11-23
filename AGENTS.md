## Daily choices record

**2026-11-22** Work on local `main` and commit upstream changes there. Morgan runs the hosted customer development deployment and verifies that the original client retains read and write access after the second deploy.

# AGENTS.md

## Pre-release hard cutover

This project is in development. Fix the current development line and move
in-scope consumers forward. Do not create backports or maintenance branches.
Storage resets require explicit authorization.

**Temporary: retain this policy until the maintainer explicitly removes it.** Replace superseded designs outright, including in-scope callers, tests, and docs. Except for the connected Node storage upgrade policy below, no compatibility aliases, dual paths, fallback decoders, legacy fields/tables, translation migrations, version shims, or compatibility-only tests without explicit approval in this chat. Existing compatibility code is not precedent.

For connected browser AggregateNode and ServiceNode schema changes, update the
current Drizzle tables and append ordered SQL in the family’s `aggregateNodeDatabase`
or `serviceNodeDatabase` declaration. Each step must preserve original command
identity, binding, meaning, order and producer progress. Run it locally under
the Node lease and commit it with its migration record. If an older format has
an outstanding prerequisite the new reader cannot honor, keep the original
and report the blocker. [Offline migration policy](wiki/adrs/027-connected-browser-node-storage-upgrades.md)

Other changed fixed schemas continue to require empty affected storage unless
a supported upgrade path is explicitly approved. Storage resets always require
explicit authorization. This policy permits upgrade implementation; it does
not imply that an upgrade path already exists.

**Reject incompatible deployments before changing durable state.** Check the
candidate against retained declarations and the source storage expected by any
migration using a read-only preflight. A rejection must report the conflict
while the serving Worker and its storage stay usable. Run this check before
DDL, ledger writes, catalog changes, or any candidate activation that can
perform them. See [deployment preflight](wiki/patterns/system-worker/repo-lifecycle.md#check-deployment-compatibility-before-writes).

## Zerospin parallel models

After seed, all data in Zerospin's parallel models must be created or changed
only by command execution or command replay. An admitted session command
originally executes on its addressed owner release. Each release materializes
its own models from the shared command history and can record a different replay
outcome. Each Aggregate release after the first reads its initialization prefix
from its declared predecessor and receives later commands from AggregateChain.
The Service `canonical` release supplies ServiceChain's adopted published history.
Authored queries, authentication, external requests, and helpers must not
directly populate, backfill, synchronize, or repair model rows.
See the central [parallel-models skill](packages/sdk/skills/zerospin-parallel-models/SKILL.md).

## Working rules

- When handing off a pull request for review, mark it ready for review and
  wait for the Codex code review of the current head commit to finish.

- For UI work, always look for an existing shadcn-style component backed by Base UI first. If none fits, adapt shadcn's Base UI version or compose Base UI primitives with the project's existing styles. Build a custom component only when those options cannot meet the requirement.

- If the contract is not on an aggregate/service release it's not supported.

- The maintainer **FORBIDS adding `ownerKind`, EVER**. Use explicit domain methods instead. Do not recreate the same domain switch under another property name.

- Name every authored TypeScript type alias and interface with `I` followed by a PascalCase name, such as `IPaymentsSession`. This includes local types, component props, inference helpers, type predicates, and test/story types. Preserve names required by external declaration merging and leave generated or third-party declarations unchanged. Generic type parameters, classes, and runtime values are not type aliases or interfaces.

- ADRs exist for context and documentation, not as immutable design constraints. Reconsider their decisions from first principles when examining the architecture, and update or supersede them when the agreed design changes. Never preserve a design solely because an old ADR describes it.

- In testing, always prefer concision over comprehensiveness: use the smallest set of meaningful tests that proves the required behavior and failure paths, rather than exhaustive coverage.

- Method profiles (`*.profiles.ts`) contain exactly one representative success profile and one representative rejection profile when those outcomes exist. Keep canonical declarations, seed rows, and lazy setup returning the invocation in that file. Capture with `profileUtils.capture` and put outcome/span-tree inline snapshots in the sibling `*.profiles.spec.ts`. Captures retain the native Exit and Effect failure stacks; successful spans do not promise authored source fields. Use `--mode profile` for bounded, redacted argument/result snapshots. Do not catalogue every error code or input permutation.

- Do not create test files, test fixtures, test/check runners, or their configuration unless the user explicitly requests them in this chat. Preserve existing Storybook stories, configuration, and supporting UI fixtures; they are exempt from this rule.

- NEVER iterate a record with `for (const [key, value] of Object.entries(record))`, including `for (const [contractName, binding] of Object.entries(agent.contracts))`. Use `mapValues` from `es-toolkit` with `(value, key)` callbacks for record traversal and validation.

- Avoid the ambiguous word “target” when a specific domain term is available. Name the referenced entity and qualify its identity fields. For example, use “async contract name/version, such as `processExternalPayment@1.0.0`, within the retained owner/actor context” instead of “target name/version”; that phrase could otherwise mean an actor, service, or delivery destination.

- Use canonical terms consistently in code, docs, plans and explanations: **admitted command**, **`serviceIndex`**, **`outcome`** and **`dispositionChainHash`**. `outcome` is `{ result: Success | Failure, finalizedAt }`; branch selection uses `outcome.result._tag`, and `finalizedAt` sits outside both result branches. Aggregate `IEvaluatedAggregateCommand` retains the full admitted command with canonical `id`. Explain these terms without substituting informal synonyms.

- Values typed as `ICommand` or any encoded, admitted, retained, or evaluated command remain commands. Never call these values “receipts” in variables, comments, documentation, or explanations. Use `admittedCommand`, `retainedCommand`, or `evaluatedCommand` as appropriate.

- In explanations, including plain-language summaries, name the exact component, method or field. Never substitute vague labels such as “worker”, “server”, “receiver” or “system” for a known component such as `AggregateVersionRepo`. State which component performed which operation and which durable fact proves it. Keep admission, execution commit, dispatch acknowledgement and `outcome` retention distinct; do not collapse them into unexplained “accepted”, “done” or “confirmed”. Simplify the language without blurring ownership or lifecycle meaning.

- Please remember that we are using transaction boundaries whenever possible, synchronous ones even.

- A Durable Object that owns a materialized resource view must not also own retained command, event, execution, audit or projected history. It may own materialization checkpoints and complete pending delivery rows, committed atomically with resource changes. Delete dedicated delivery rows after durable receiver acknowledgement; fanout payload deletion requires acknowledgement from every covered subscriber. Queues that read retained Chain history advance acknowledgement state or subscriber cursors without deleting that history. Retention follows the row’s responsibility, not whether its owner is named Repo or Chain.

- Do not soften well-supported conclusions out of humility or a desire to agree. Make sound architectural arguments firmly, explain concrete failure modes, and treat correctness requirements as requirements—not optional caveats. Reconsider when evidence changes, not merely when challenged. Express genuine uncertainty precisely.

- Take initiative to make this repo more obvious. In the area you are working, remove redundancy and bloat: duplicates, unused paths, and names that hide what the thing is. Delete that cruft. Do not rename it and keep it, and do not explain it as a second concept.

- When weighing a smaller change against a clearer data model or architecture, **always prioritize the clearer data model or architecture**.

- Use `$use-morgs32-wiki-patterns` and the [local index](./wiki/patterns/index.md); local rules take precedence. Follow [scoped execution](../home/skills/use-morgs32-wiki-patterns/references/patterns/tooling/scoped-execution.md), reusing relevant context.
- Use `$implement` for approved work and unfinished verification. Be concise and explicit about uncertainty; distinguish current code from intended architecture.
- Resolve unsettled design choices through [grill-me](../home/skills/grill-me/SKILL.md); do not re-approve settled decisions. Record agreed work in Linear team MOR, keep domain terms in `wiki/glossary.md`, and record only qualifying decisions in `wiki/adrs/`.
- Never add `ALLOWED_CAST` without explicit user authorization; ask if a necessary cast requires it.
- Use `$to-spec` for the canonical Linear issue, `$to-tickets` for sub-issues, and `$implement` for verified completion. Keep wiki plans as historical records. Follow [to-spec](../home/skills/to-spec/SKILL.md#document-conventions) for repository document conventions, and [handoff](../home/skills/handoff/SKILL.md#destination-and-lifecycle) for handoffs. Keep governing ADRs in `wiki/adrs/`; mark a replaced ADR **Superseded** and link its successor. Move it to `wiki/archive/adrs/` only when it no longer governs anything and archival is wanted.

## Existing local development URLs

Use only this repository's existing, configured Portless `.localhost` URLs and
`__dev` sign-in routes for local development and permitted browser verification.
Reuse the documented URLs and running services; start or restart those same
configured services when needed. Do not substitute raw `localhost:PORT` or
`127.0.0.1:PORT` URLs, create extra aliases or subdomains for verification, or
start parallel app servers merely to obtain a fresh browser origin. Keep any
authorized storage isolation behind the existing URLs and follow this
repository's storage rules. Use a different origin only when the user explicitly
requests it.

Application-specific URLs and browser-verification restrictions remain in each
example's `AGENTS.md`.

## Documentation ownership

- The docs app's `docs/content/{handbook,guides,reference}/` owns developer concepts, public API usage and examples. Extend its existing sections and navigation.
- `wiki/architecture/` owns runtime workflows, component ownership, transactions, retained history, delivery and recovery, including all system-worker internals. Source comments retain local implementation reasoning.
- Do not create `packages/*/src/**/README.md`. Consolidate source-module explanations in the docs app or architecture. Keep package-purpose, example and operational test READMEs in their existing roles.
- Plans, handoffs, ADRs and dated reviews retain status, decisions and historical evidence. Repair live documentation links; use commit-pinned source links when historical meaning depends on removed documentation.

## Ideal method shape

**This is the best method shape we can hope for: simple, tidy, compact, and readable from top to bottom. Strive toward it in all our methods.** Establish the inputs, call focused procedures in a clear order, and return the result:

```ts
const system = decodeSystemProps(props);
validateReleaseRegistries(system);
validateContractRegistries(system);
validateMappedContracts(system);
validateActorVersions(system);
validateServiceModelOwnership(system);
validateAgentSessionReleases(system);
return system;
```

Let the parent method read as a short list of named domain steps. Each called procedure should own a cohesive responsibility, with a name that makes its work obvious. Keep transaction boundaries and required sequencing intact. This is an ideal worth striving toward, not a line-count quota: extract meaningful work, avoid forwarding wrappers, and keep simple operations inline when that is clearer.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

<!-- graft:start -->

## Graft (optional)

Use `graft ask "<question>" --source` to locate context, `graft skeleton <file>` for signatures, or `graft callers <symbol>` for indexed edges. Verify current source; ranked results are not exhaustive. Use `rg` for exhaustive searches, reuse findings, and refresh the graph only when needed.

<!-- graft:end -->

## Start from first principles

In design discussions and implementation, name the required behavior and sketch
the simplest end-to-end flow you’d build today before using existing code as a
starting point. Show the underlying calls. Keep a wrapper, state, or handoff only
if you can name the problem it solves. Remove machinery the design no longer needs.
