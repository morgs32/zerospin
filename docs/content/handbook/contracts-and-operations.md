---
title: Contracts and operations
description: Describe validated commands with named operation methods, Effect programs, typed results, and declared business failures.
order: 4
---

## A contract is your write API

A contract release declares a command name, payload shape, read-model scope, named operation definitions, guard, Effect program, optional result codec, and business failures. The browser can evaluate a canonical contract for optimistic state; the server evaluates it in the authoritative owner context.

Put every business input in `payload`, including named IDs such as `purchaseId`.
Declare readable models in `models`, then query the current row explicitly and
check existence, ownership and eligibility during evaluation. A command has no
generic resource subject. `resourceId` identifies the resource affected by a recorded model
operation, as in the create below.

This small feature creates a note and returns its ID. Keep the model and contract declarations in separate files:

```ts title="src/noteModel.ts"
import { defineModel } from '@zerospin/sdk/browser';

export const noteModel = defineModel({ name: 'note', abbreviation: 'nte' });
```

```ts title="src/noteV1.ts"
import { makeModelVersion, primitives } from '@zerospin/sdk/browser';
import { noteModel } from './noteModel';

export const note = makeModelVersion(noteModel, {
  version: 1,
  attributes: { text: primitives.text() },
  indexes: [],
});
```

```ts title="src/createNoteV1.ts"
import {
  defineAggregateContract,
  makeAggregateContractRelease,
  modelId,
  primitives,
} from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';
import { noteModel } from './noteModel';
import { note } from './noteV1';

export const createNote = makeAggregateContractRelease(
  defineAggregateContract('createNote'),
  {
    version: 1,
    operations: { createNote: note.operations.create },
    payload: {
      id: modelId({ model: noteModel }),
      text: primitives.text(),
    },
    result: Schema.Struct({ noteId: Schema.String }),
    program: Effect.fn('createNote.program')(function* ({
      payload,
      operations,
    }) {
      yield* operations.createNote({
        resourceId: payload.id,
        attributes: { text: payload.text },
      });
      return { noteId: payload.id };
    }),
  },
);
```

This example teaches the program shape. A production owner adds its actor and authorization rules; the [first-feature guide](/guides/build-first-feature) does that for the game.

Grant an ordinary contract through explicit Actor, Agent or owner `system` maps.
The same exact canonical release may appear in several maps; it has no fixed
invocation kind or principal name. Each command's `kind` records the grant used.
Actor grants validate the contract's claims against that Actor's identity. Agent
and System grants reject claims-dependent contracts. External implementations
belong only in the owner's `external` map.

The owner derives its execution-facing `contracts` inventory from those maps.
Repeated references to one canonical object coalesce; different objects or
versions under the same command name reject during construction. Declaring the
contract or recording its operation does not grant an invocation path.

## Version identity and historical decoding

Each contract release owns complete immutable portable metadata: its name/version,
singular payload shape, claims, failures, result, readable models, operations and
external response/timeout facts. Runtime `previous`/`next` and executable callback
bodies are not serialized. An upgrade changes the declaration; payload adapters
validate the source and every intermediate decoded value during replay. Ordinary
upgrades inherit omitted declaration fields and patch payload/model maps by key
(`null` removes a field). Omitted `up` declares an identity step whose source
and destination codecs still run; supply an adapter when values must change.
`down` is explicit and is never inherited from another edge. Retained command
bytes and recorded model operations are not rewritten.

Each external request version pairs an exact pure definition with a backend
implementation. The pinned emitting release interprets the first observation
and encodes the selected ordinary continuation's payload. Version that ordinary
contract and declare payload adapters when the admitted shape changes.
[External work](/handbook/external-work)

Declare upgrades before composing the System. `makeSystem` finalizes the reachable
lineage, and `makeSystemSpec` includes each reachable version's own metadata in the
whole SystemSpec accepted by SystemRepo. Contract read models bind versions in
the owner's `modelVersions`; mutation metadata references `{ modelName, version }`
instead of repeating full models. These portable references do not replace native
model or operation capabilities. New commands still require the exact
version registered on their addressed aggregate/service release. A historical
codec appearing in SystemSpec does not expose it through an Actor or session or
support fresh commands. Replay preserves its decoding and authority checks
without a per-command spec comparison.

## Record operations and return the domain result

The program receives recording methods matching its named operation map. Calling one creates a lazy Effect; yielding it constructs, validates, snapshots and records one deferred description. Return only the domain result. The checked `contract.evaluate(input)` method runs its guard and program, validates the whole batch and result, and returns `{ operations, result }` without applying writes. The owning workflow encodes the result before applying the complete batch in its transaction.

Guards and programs receive both the original decoded `command` and the
`payload` adapted to the executing contract. The original command retains its
source `contractVersion` and its actual lifecycle shape: a session submission
does not yet have the IDs assigned during admission. Narrow known source
payloads with `Schema.is(contract.knownCommandSchema)(command)`; a future
version unknown to this declaration has an unknown payload. Direct
`contract.evaluate` takes the command and derives the adapted payload; its
caller-supplied input does not establish admission or authorization.

| Work                                | Construct                                                  |
| ----------------------------------- | ---------------------------------------------------------- |
| Read state or perform a guard check | `yield* findFirst(...)` inside `Effect.gen` or `Effect.fn` |
| Record one resource operation       | `yield* operations.createNote({ resourceId, attributes })` |
| Return without mutations            | `return result`                                            |
| Order operation phases              | Yield recording methods in the required order              |
| Record operations for each item     | A sequential `for...of` loop yielding a recording method   |

`models` grants read access independently from mutation permission. Declare `operations: { createNote: note.operations.create }` and add entries for other permitted operations. The note example grants create permission and needs no database reads. Reading a model does not grant permission to mutate it; declaring its operation definition does not grant reads. An omitted operation map supplies no recording methods. Guards receive no recording methods.

Keep callback return types inferred so the factory can check the domain result. Omit `result` only when the returned result is `undefined`; its retained wire value is then `null`. Ordinary upgrades inherit omitted operations and result codecs; explicitly supplied map entries replace matching keys. A failure escaping evaluation discards the complete batch. Retrying the complete evaluation starts with a fresh collector. Reads observe pre-application state throughout evaluation.

Every model operation definition exposes a bidirectional `.schema` codec and a `.make` constructor. Use `.schema` when decoding or encoding an individual portable operation; use the contract's derived `operationsSchema` for its permitted batch. Decoding restores the exact canonical model or external-contract reference. Local names such as `createNote` are never wire identities.

## Put business checks at the right boundary

The contract's `guard` receives its declared models through a read-only database and may reject an invalid operation. Declare failures explicitly, for example `failures: { invalidMove: ContractError.schema({ code: 'invalid-move' }) }`, then fail with the supplied constructor: `yield* failures.invalidMove.make({ extra: null })`.

Browser validation makes the interface responsive, but a browser claim or local row does not authorize a server write. Actor and aggregate guards enforce access and current authoritative domain state. A game move should validate the old board and turn; a cart mutation should validate the authenticated shopper's ownership. Read [actors and authorization](/handbook/actors-and-authorization).

## Record outgoing work from the same program

The ordinary program may declare model, command and same-family pure external
operations in one ordered batch. Browser staging validates all entries and applies
only model operations, preserving original sparse indexes and inverse undo order.
It creates no destination command IDs or external requests. Original canonical
execution alone prepares complete outgoing intents and commits them with local
model changes, encoded result and `outcome`. Failure retains no successful output
or dispatchable work. Replay, additional parallel releases and optimistic rebasing
never produce fresh outbound work; delivery retries reuse frozen identities.

`makeCommandOperation({ destination: { service: ownerDefinition, version: 1 }, contract })`
records an exact claims-free ordinary command in the same System. Aggregate
references use `{ aggregate: ownerDefinition, version: 1 }` and require an
`aggregateId` when recording. Use the exact browser-safe owner definition retained
by the release and exact completed contract object in that release's `system`
map; composition and original preparation verify that binding. Durable destination admission is separate from
its execution and retained `outcome`.

Declare provider work with browser-safe `defineAggregateExternalContract` or
`defineServiceExternalContract`. The pure definition owns payload/response codecs,
timeout and `.externalOperation`. The backend consumes the same object with
`makeAggregateExternalContractRelease(definition, { request, program, ... })` or the service
equivalent. Keep provider callbacks, credentials, Layers and recorded continuation
models outside browser modules. Each emitted definition must resolve to its exact
same-family implementation in the originating release's `external` map; Actor
claims checks inspect that resolved implementation.

Ordinary actor programs retain actor-selected reads. When private canonical
derivation is required, record a command to an explicit claims-free internal
ordinary contract granted in the owner's `system` map and invoked with
`kind: 'system'`. Read [external work](/handbook/external-work)
for request, continuation and recovery boundaries.
