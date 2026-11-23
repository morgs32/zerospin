# Declaration lineage and storage

Read this when preserving command history, changing model versions, revoking an
actor capability, or planning a storage cutover. These are separate decisions.

## Ordinary payload lineage

Authored versions are positive safe integers. Each named declaration advances
independently; unchanged declarations keep their version inside a newer owner
release. Evaluate contract versions, owner releases, Service `canonical`
selection and release retirement independently.

For an existing contract, **using its matching upgrade constructor is mandatory**.
Import the exact previous declaration and upgrade it; do not copy its fields into
an independent `make*ContractRelease` with the same name and a larger number.
That produces disconnected declarations. The requirement applies when only an
operation definition, model binding or callback changes, even with an unchanged
payload. Models use `upgradeModelVersion`; actor evolution uses the appropriate
update API where its merge semantics express the intended change. Use initial
constructors for genuinely new declarations. Any independent-history cutover
requires explicit authorization covering the affected stored history; a
pre-release label is not that authorization.

Each contract release owns complete singular portable facts: payload, claims,
failures, result, read models, operations and external response/timeout metadata.
Aggregate, Service and Agent Release factories retain native declarations.
`makeSystemSpec` compiles their detached portable metadata after System validation
and contract-lineage finalization. Public session locks still contain
only their selected-version facts.

Finish every upgrade before `makeSystem`. Successful composition finalizes the
entire participating `previous`/`next` graph; extending any of those shared nodes
later is refused, while reuse of the completed graph is valid. `makeSystemSpec`
automatically compiles all reachable own version specs, including historical
sources, intermediate codecs and descendants omitted from current release
bindings. In the portable SystemSpec, each owner stores full definitions once in
`modelVersions`, `contractVersions`, `actorVersions` and `agentVersions`. Release
maps bind models, Contracts, Actors and Agents by name and exact version. Contract
read projections carry model identity and selected field shapes without binding
the source model version. Agent model maps remain version bindings; mutation
operation metadata uses `{ modelName, version }`. Actor exposed-model projections stay inline because
limited views may differ under the same canonical model identity. The compiler
collects all reachable canonical models and rejects conflicting version facts;
receiving boundaries reject missing and mismatched references.

The returned SystemSpec has a canonical SHA-256 hash excluding its own hash field.
Hashing rejects non-JSON metadata. SystemSpec preserves every registered
release, each declared Aggregate predecessor and each Service's `canonical`
selection.

SystemRepo accepts or rejects that whole snapshot in one synchronous transaction,
comparing immutable owner-local model, Contract, Actor, Agent and release facts
against all retained snapshots. Omitted versions
remain protected by earlier snapshots. Startup and session-ticket issuance check
acceptance of the actual executing compiled hash; replay adds no comparison RPC.
Fresh commands require the exact version on their addressed release, even if an
older version remains in runtime lineage or compiled historical metadata. Existing
payload/adapter-output decoding, recorded authority and exact-model operation
checks still run. The hash does not fingerprint executable programs, guards,
codec transformations or adapters.

An ordinary upgrade records a parent edge. Each predecessor may have one next
version, and a lineage cannot repeat an integer version. Payload adapters convert
one edge at a time; the source payload and each adapted payload pass the
corresponding version's decoded-value schema. Omitted `up` creates a forward
identity step, which still validates the destination and can reject incompatible
history. It does not run a newly added codec's wire transformation. Supply an
adapter when the decoded value needs conversion. Missing reverse adapters refuse
reverse adaptation; no inverse is inferred. These are payload transformations,
not model-row migrations or a promise to support every historic release.

Omitted payload fields, models, operations, claims, failures, result, guard and
program inherit from the canonical predecessor. Payload and model maps patch by
key, with `null` removing an entry; operation maps keep omitted entries. Guard
and program requirements and result types retain their inference. An inherited
callback receives the executing declaration's `db.models` and recording
operations. Use those bindings for version-sensitive reads and writes rather
than capturing an old model or operation definition.

These complete browser-safe modules add a payload field and replace
the program while inheriting the result codec. Each version has one defining file; neither
performs a mutation.

`describeNoteV1.ts`:

```ts
import {
  defineAggregateContract,
  makeAggregateContractRelease,
  primitives,
} from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

export const describeNoteV1 = makeAggregateContractRelease(
  defineAggregateContract('describeNote'),
  {
    version: 1,
    payload: { title: primitives.text() },
    result: Schema.String,
    program: Effect.fn('describeNoteV1')(function* ({ payload }) {
      return payload.title;
    }),
  },
);
```

`describeNoteV2.ts`:

```ts
import {
  primitives,
  upgradeAggregateContractRelease,
} from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { describeNoteV1 } from './describeNoteV1';

export const describeNoteV2 = upgradeAggregateContractRelease(describeNoteV1, {
  version: 2,
  payload: { subtitle: primitives.text({ nullable: true }) },
  up: Effect.fn('describeNoteV2.up')(function* ({ payload }) {
    return { ...payload, subtitle: null };
  }),
  program: Effect.fn('describeNoteV2')(function* ({ payload }) {
    return payload.subtitle === null
      ? payload.title
      : `${payload.title}: ${payload.subtitle}`;
  }),
});
```

Keep defining imports canonical. Creating the same predecessor independently
does not recreate its registered lineage. A V1 declaration file remaining on disk
does not make V1 supported after every registered release that reaches it is
removed. Preserve the original owner release until its retirement conditions are
established; retain every source version required by admitted commands in at
least one registered release's actual contract lineage.

## External request versions

Declare each external request version with its exact pure definition and
backend implementation. The definition owns the payload, response codec and
timeout. The pinned emitting release interprets the retained observation with
that declaration and encodes an ordinary continuation. To evolve the authored
continuation payload, upgrade the ordinary contract and supply its payload
adapters. Replay reads ordinary command history and produces no provider work.

## Models and exact bindings

`modelRef` references a stable `defineModel` identity and its prefixed `id`
contract. The selected owner's model registry binds the concrete referenced
version. A referenced model gaining a non-key attribute does not change that
relationship spec or force new versions of unchanged indirect models/contracts.
Changing the referenced key semantics, relationship destination, nullability or
relation settings remains an explicit schema change. Contract read projections
require the selected owner's model to retain each projected read shape; model
operations remain bound to exact owner versions.

`upgradeModelVersion` retains model name/abbreviation, patches attributes, and
rechecks inherited or replaced indexes. Removing an indexed attribute requires
fixing that index. Rebind operation definitions to the new model and upgrade
contracts when their mutation or projected read requirements change. Then update
actor query databases, `exposedModels` declarations and selections. Actor
`db.models` and selections use the exact canonical owner objects;
limited `exposedModels` retain canonical identity, version and field codecs.
Aggregate and Service actors both declare `exposedModels`; session `models`
must agree with the selected actor's exposed declarations, and
session contracts with its supported public versions.

An actor update cannot delete a selection or contract by passing `{}`. It merges
those maps; service actors also merge guards. When revoking a capability,
construct a complete new actor declaration and register its exact version.
Owner and actor versions used by a live session are fixed; initialize a new
instance for changed bindings using the application's session-lifetime owner.

Ordinary command operation definitions retain the exact `defineAggregate` or `defineService`
object, explicit destination release version and exact claims-free ordinary
contract. Completed releases retain that owner definition as `definition`.
System construction and original preparation both resolve and check those objects;
portable family/name/version facts do not reconstruct authority. Rebind operation definitions
when changing a destination contract or release. Pure external definitions retain
payload/response codecs and timeout independently of provider code. Replace their
external operation definitions and the exact same-family backend implementation in the owner
release together; matching names cannot substitute for definition identity.

Removing access from a new actor does not remove the declarations in
still-supported old owner releases. Include those exact release/actor identities
and existing admitted instances in a security revocation rollout; verify both
fresh admission and later command refusal using the running definitions.

## Introduce and validate; consider promotion or retirement

Promotion is optional; the steps below describe it only when an adopted-history
source change is needed.

Follow the [System registry rule](../../zerospin-parallel-models/SKILL.md#system-registry-changes):
present exact before-and-after snippets and obtain the user's approval before
changing `system.ts`. The agent may then make the approved changes.

1. **Introduce the candidate without retiring the current release.** Compose a
   new Aggregate or Service owner release with the upgraded declarations and
   register both releases in `makeSystem`. For an Aggregate, name the earlier
   release with `branchFrom` or `rebuildFrom`. For a Service, keep the existing
   `canonical` value while validating the candidate.
   Preserve every exact destination release referenced by retained command
   operation definitions, and every historical contract/Actor version needed to interpret
   admitted commands. An unchanged declaration can be reused across releases.
2. **Verify the candidate against retained history.** Let its materializer consume
   the required finalized history prefix. Verify source codecs, adaptation paths,
   execution behavior and durable publication for existing instances. A fresh
   storage test cannot establish retained-history compatibility. Use the actual
   history frontier when comparing progress. Older registered releases also
   consume newer commands, so verify their reverse adaptation paths; unchanged
   payloads can use explicit identity `down` adapters. A caught-up resource view and
   publication of its evaluated history are distinct facts.
3. **Adopt the validated release in the intended exact session bindings.** For
   Service promotion, present the proposed `canonical` change for approval
   with the adopted position and the candidate's durable publication progress.
   `ServiceChain` reads its adopted prefix from the prior VersionChain until the
   new release publishes through that position. Verify replay completion and
   behavior against retained history.
4. **Present retirement evidence separately from adoption or promotion.**
   Present the proposed before-and-after omission for approval. Keep each
   Aggregate predecessor registered while a listed release names it. Establish
   which instances, admitted commands, Actors, Agents, pending deliveries,
   external operations and live consumers still require the release. Preserve historical contract
   versions in a registered release's reachable runtime lineage and any exact
   owner-release references that remain in use. Removing an original owner
   release can be safe when another registered release retains the needed
   lineage; merely retaining portable metadata or source files is insufficient.
   Check the proposed remaining registered graph and retained-history behavior
   before recommending removal.

`dispositionChainHash` commits the previous hash, command position, command ID
and `outcome.result._tag` for each admitted command. Equality does not prove
equal result values, failure details, operations or resource state. Establish the
required validation criterion explicitly; hash agreement and progress alone do
not certify replay correctness.

## Storage decisions

Adding a model version does not migrate existing rows. Establish which owner
release/storage graph and browser database will use the declaration, and what
happens to retained history, pending commands and existing instances. Contract
payload adapters cannot repair an incompatible SQL schema. Do not compensate
for a missing upgrade edge by resetting storage or removing its historical
release; restore the required declaration support and verify the retained graph.

Apply the application's governing storage policy. Zerospin's pre-release policy
requires empty affected storage for changed fixed schemas; this is not a blanket
instruction to erase application data for every declaration edit. Inventory the
affected stores and obtain the required reset authorization before destructive
work. Do not manufacture fallback decoders or row translations to bypass a
cutover. Existing application checks should establish the intended fresh-state
and retained-history behavior separately; typechecking alone proves neither.

Source basis: current framework source; `packages/core/src/models/make/makeModelVersion.ts`,
`packages/core/src/contracts/make/constructContractRelease.ts`,
`packages/core/src/contracts/decodeAndAdaptPayload/adaptPayload/adaptPayload.ts`,
`packages/core/src/aggregateActor/updateAggregateActorRelease.ts`,
`packages/core/src/serviceActor/updateServiceActorRelease.ts`,
`packages/core/src/declaration/validateModelVisibility.ts`,
`packages/core/src/aggregateSession/make/makeAggregateSessionLock.ts`, and
`packages/core/src/serviceSession/make/makeServiceSessionLock.ts`.

## Independent Agent declarations

An Agent release binds one exact owner name/version and serves as its own session
definition. Register it in `aggregateAgents[aggregateName][agentName]` or
`serviceAgents[serviceName][agentName]` with `{ releases, active }`. Replacing an
Agent does not require a new owner composition. The owner declares every granted
contract; a permission-neutral `contracts` registry adds no System grant.

Portable `agentVersions` remains scoped to the owner name. Each Agent spec
retains its exact `ownerReleaseVersion`, projected model specs, contract grants
and named wake-rule bindings. SystemSpec acceptance checks immutable retained
version facts independently of the active Agent selection.

A replacement captures a fresh selected snapshot, rebuilds pending wakes and
installs its processing position atomically. Removal and replacement abandon pending deliveries. The next
installation emits under a fresh producer sequence. Previously admitted
commands remain in the owner Chain. Schema cutover is explicit; it authorizes no reset.
