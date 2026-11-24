---
title: Releases and systems
description: Wire exact model, contract, actor declarations and session definitions into a deployable application system.
order: 6
---

## Releases compose executable declarations

An aggregate release is the authored combination of models, contracts, actors, and owner guards for one aggregate version. A service release is the corresponding combination for one service version. Neither is a live connection or a package release.

Declaration constructors retain native codecs, callbacks, and references; they do
not build portable specs or freeze declaration metadata. `makeSystem` validates
the nested declaration graph once. Treat composed declarations as readonly;
`makeSystemSpec({ system })` is the explicit compilation step that generates
JSON Schema documents for portable metadata. Native codecs continue to validate
actual values; portable schemas do not encode arbitrary executable predicates.

If the contract is not on an aggregate/service release it's not supported. The
owner derives its readonly `contracts` inventory from registered Actor and Agent
contract maps plus explicit `system` and `external` maps. Do not supply a separate
owner `contracts` input. Repeated grants of the same canonical ordinary release
coalesce; conflicting objects or versions under one name reject. Fresh invocation
authority comes from the map selected by `command.kind`. New commands use the
exact version granted on their addressed release; replay may decode and adapt
historical versions. Session exposure and runtime lineage do not grant an
additional invocation path.

Use the vocabulary consistently:

| Field or value                 | Meaning                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `aggregateRelease`             | The complete authored aggregate composition                        |
| `aggregateVersion`             | An exact positive integer aggregate version, such as `1`           |
| `serviceRelease`               | The complete authored service composition                          |
| `serviceVersion`               | An exact positive integer service version                          |
| `actorName` and `actorVersion` | The capability's exact authored identity                           |
| `contractName`                 | A registry key identifying the contract you call                   |
| `contractVersion`              | The exact command schema/program version retained with the command |
| `sessionDefinition`            | Browser executable declarations and host configuration             |
| `systemName`                   | The authored system name                                           |
| `systemId`                     | The deployed system's durable identity                             |

Each named declaration has its own positive safe integer version. Start at `1`
and increment when that declaration changes; unchanged models and contracts
keep their version inside a newer owner release. npm package SemVer and
Cloudflare deployment identities remain separate.

A frontend session selects the same canonical ordinary contract exposed by its
backend Actor. The owner derives that contract's inventory entry from the Actor
grant. An ordinary release has no fixed invocation category: grant it separately
in `system` when administrative or recorded commands may invoke it, or in an
Agent's contracts for that Agent's work. Agent and System grants require
claims-free ordinary releases. Register backend external implementations under
`external`; they never belong in Actor, Agent or System maps. Emitting an operation
does not register or grant its destination contract.

## Build the system registry

A system registers owner releases under their names and exact integer versions.

```ts title="src/system.ts"
import { makeSystem } from '@zerospin/sdk';
import { aggregateRelease } from './gameAggregateReleaseV1';

export const system = makeSystem({
  name: 'tic-tac-toe',
  aggregates: { game: { releases: { 1: aggregateRelease } } },
});
```

For each Aggregate release after the first, declare `branchFrom` or
`rebuildFrom` and keep the named predecessor registered. Add a Service through
`services: { marketplace: { releases: { 1: serviceRelease } } }`.
A later Service release names `branchFrom` or `rebuildFrom`. Registry keys must match release names and versions.
[Owner Chain reuse and handoff](/handbook/versioning-and-deployment#reuse-the-owner-chain-across-releases)

`makeSystem` validates registry consistency, contract wiring, actor declarations,
model ownership and Agent bindings. Finish all contract upgrades before calling
it. Successful composition finalizes every reachable `previous`/`next` node.
You can reuse completed lineage across Systems. Plan later upgrades before
composing a System that uses those declarations.

Sessions address their exact registered release. If an older release lacks a
new contract, replay advances with a local refusal and applies none of that
command's operations. Before omitting a release, check predecessor references,
historical contract lineage, exact consumer bindings and pending work.
[Upgrade and retirement sequence](/handbook/versioning-and-deployment#add-and-validate-consider-promotion-or-retirement)

Keep one version per declaration file. Import model and contract versions directly at their use sites. Avoid a convenience file that spreads every model and contract into every release: it hides ownership and broadens capabilities accidentally.

Retained releases replay commands using their own declarations and keep their
own results. New functionality belongs in a new release; consumers adopt it by
selecting that exact release. See
[adding functionality](/handbook/versioning-and-deployment#add-functionality-through-a-new-release).

## Contract-support refusals

Use `aggregate-contract-unsupported` and `service-contract-unsupported` as the
consistent public codes when an executing release does not support a command's
contract. The contract-support category applies to ordinary commands and
recorded external commands. Describe the missing support in the diagnostic
message rather than introducing separate public names for administrative,
external or lineage support failures.

For a valid admitted command whose source declaration and input have been
verified, absence from another release is an expected release-local refusal.
That release must retain its failed `outcome` and continue replay. It must not
retry the unsupported command indefinitely, repeat the provider request, or
change the original supporting release's `outcome`. Missing or invalid source
history, invalid authority, malformed input and adapter failures remain distinct
failures; the contract-support category must not conceal them.

AggregateVersionRepo and ServiceVersionRepo validate an unsupported recorded
external command against its exact source declaration, including the frozen
payload and provider observation, before retaining the refusal. Source
validation does not call the provider request. An unavailable source declaration
or invalid observation still stops replay; it is not a local support refusal.
Administrative invocation authority remains a separate check: having a contract
in a release does not grant its System or Actor entry point.

## Accept the complete SystemSpec

`makeSystemSpec({ system })` compiles a portable JSON snapshot with a flat
`.hash`. Each Aggregate/Service owner retains complete canonical definitions once in
`modelVersions`, `contractVersions`, `actorVersions` and `agentVersions`, keyed
by declaration name and exact version. Both owner families retain every registered
release in `releases`. Aggregate releases retain their declared predecessor and
Service owners retain their explicit `canonical` selection. Release `models`, `contracts`,
`actors` and `agents` are numeric version bindings into those owner-local
registries; `system` and `external` remain exact command-version grant maps.
Contract and Agent read-model maps are numeric bindings too. Mutation operation
metadata carries `{ modelName, version }`. Actor `exposedModels` stays inline in
each Actor version: a limited projection may share a canonical model identity
while intentionally exposing fewer fields.

The compiler collects canonical models from registered releases, Contract reads
and mutations throughout reachable lineage, and Agent query databases. Historical
source, intermediate and descendant Contract codecs are included automatically,
without another authored registry. It rejects conflicting definitions under one
owner-local version identity. Receiving boundaries validate registry identities,
model references, release bindings and grants. Historical metadata provides
coverage; fresh commands still require the addressed release's exact grant.

SystemRepo accepts or rejects the whole snapshot in one transaction. It verifies
the supplied hash, compares immutable model, Contract, Actor, Agent and release facts with every retained snapshot,
then retains the whole accepted `{ hash, spec }`. It compares facts present in
the candidate with matching identities in earlier snapshots; it deliberately
allows omissions. A different Service `canonical` selection changes the hash and may be
accepted without changing immutable release facts. Earlier snapshots remain
after release omission. This preserves immutable metadata comparisons; it does
not restore omitted executable declarations or certify that the candidate can
consume retained admitted commands. The hash identifies canonical portable content, excluding its
own field; it does not fingerprint callback or executable adapter bodies.

Child startup requires acceptance of its actual configured SystemSpec hash before
local SQL. Session-ticket issuance checks SystemRepo's own executing hash after
ordinary session validation. Neither path repeats structural comparisons, and
replay adds no acceptance RPC. Payload decoding, adapter-output validation,
recorded authority and exact-model operation checks remain. Acceptance does not
prove that a system deployment was promoted or initialized successfully.

## Supply backend dependencies

Supply Effect services required by a release's guards, authorization, or external requests through `layer` on `makeAggregateRelease` or `makeServiceRelease`. Releases with no application requirements can omit it. Tic Tac Toe's Game releases set `layer: deterministicComputerMove`. Shopping's User releases reuse [the same provider Layer](https://github.com/morgs32/zerospin/blob/main/examples/shopping/src/zerospin/aggregates/user/userLayer.ts).

The server acquires the Layer lazily for each release. Releases can bind different implementations of the same service. The Layer is executable configuration and is excluded from the portable SystemSpec.

Export `makeConfig({ system, systemId })` from `zerospin.config.ts`. Use a stable system ID for your environment. Changing the ID selects a different durable system. For local development and deployment, [declare each release source](/guides/develop-and-deploy#define-the-project-configuration) alongside the default export.

Browser session Layers are supplied separately and contain browser-safe services such as `ZerospinApiUrl`, `PublishableKey`, and failure notification presentation.

## Give the browser a session definition

A pure session definition contains the owner name/version, actor name/version, its visible models and canonical contracts, and claims schema. The application worker registers that pure definition with its execution dependencies. Concrete browser constructors and managed React hooks receive the pure definition, application layer and transport inputs separately. `SessionProvider` publishes a managed handle; `SessionReady` and `useSession(definition)` select that same declaration directly. `useMockAggregateSession` and `useMockServiceSession` use the same definitions and consumers with local claims and seed resources. Definition construction opens no resources; each concrete constructor creates a cold live facade whose owner controls startup and disposal.

The browser module must import from `@zerospin/sdk/browser`, `@zerospin/browser`, and `@zerospin/react` as appropriate. The root SDK imports server-only authoring code. Importing the backend system or `zerospin.config.ts` into a client component crosses that boundary and can expose server dependencies or fail the build.

Continue with [sessions and synchronization](/handbook/sessions-and-synchronization), and use the [SDK reference](/reference/sdk) when wiring a new release.
