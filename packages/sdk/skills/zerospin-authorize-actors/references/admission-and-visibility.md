# Admission, visibility and provisioning

Read this when a user needs private field/row exposure, shared-service ownership
checks, or admission-time aggregate provisioning.

## Identity and visibility

For a tenant-scoped service, verify the credential's subject and tenant membership
before returning complete claims. Put only stable projection fields, such as
`tenantId` and `userId`, in `actorPath`; additional authenticated claims remain
available to policy. Selection placeholders may use only those path fields.
Use a row predicate tied to the verified tenant/user, and validate related-row
predicates as well. An unfiltered `findMany({})` deliberately selects every row.

Read privacy has two independent parts. `selections` choose rows from the
canonical query database; actor `exposedModels` choose exposed fields. To hide a secret
attribute, construct a limited model with `makeLimitedModelVersion`, retaining
the canonical name, abbreviation, version, framework fields and exact visible
descriptors/codecs. Keep public reference relationships within the exposed model
graph. Do not use selection `columns` to hide fields: actor selections require
complete canonical rows. Public contracts declare explicit read fields and the
Actor must expose each of those fields; it can hide unrelated fields from a
read-only dependency. A model mutated by the command still requires complete
canonical exposure. Session models use the chosen exposed declarations.

For writes in a shared service, compare the selected resource's canonical owner
with authenticated claims inside `actor.guards[commandName]`. A filtered cart
projection alone does not stop a caller from submitting another cart's ID.
Declare the actor-scoped refusal on the public contract and return it through
the guard's `failures` constructors. Aggregate policy instead belongs to the
bound aggregate release's guard map. Ordinary contract guards remain useful for
shared business rules and are also checked authoritatively.

## Admission provisioning

Aggregate `authorize` receives `claims`, `aggregateId`, `sessionName`, owner model
queries and `executeCommand`. Authentication cannot execute commands. In the
authorizer, execute synchronous Drizzle query reads with `.sync()`; the mere
query object does not prove a resource exists.

If admission requires a User row, read it, execute an ordinary owner-registered
creation command explicitly granted by `release.system` only when absent, inspect the returned `outcome.result._tag`, then
read again before granting access. Create a command occurrence using the public
SDK `CuidFactory` and `prefixId({ abbreviation: 'cmd' }, suffix)`, then pass only
`{ id, commandName, contractVersion, payload }` to `executeCommand`. Use the exact
ordinary contract's name/version; the bound owner's `system` map grants execution, validates and encodes the payload,
and supplies `kind: 'system'`. The callback rejects external
continuations, claims-requiring contracts and extra provenance fields. Keep this
provisioning command out of public actor and session contract maps. Never create
an actor solely to issue an authorization command or to keep that command out of
another actor’s public contract map; use a claims-free system command instead.

The creation command's own transaction owns uniqueness. Accept only its declared
already-existing outcome when a concurrent creation wins; propagate other
refusals. `outcome.result.failure` is a serialized value; convert an unaccepted
refusal with public `makeZerospinError` before failing the authorizer. Construct
the occurrence once within an invocation before any authored
execution retry. Do not overwrite existing profiles or permissions to make
admission succeed. `executeCommand` returns the retained `ICommandOutcome` directly:
`{ result: Success | Failure, finalizedAt }`. Its success value is JSON; decode it
with the ordinary contract codec when needed. Retrying the same immutable command
returns its first result and `finalizedAt`; execution does not wait for later
external work. API/framework failures use the Effect failure channel, while a
finalized business refusal remains in `outcome.result`. Authorizer completion is
`void`, not an uninspected command outcome.

Aggregate authorization runs outside execution permits and transactions, allowing
same-owner command reentry. A committed creation remains durable if admission
later refuses. Service authorization has owner query reads but no corresponding
`executeCommand` capability; do not transfer the aggregate provisioning pattern
to it.

Source basis:
`packages/core/src/identity/types.ts`,
`packages/core/src/identity/make/makeActorIdentity/makeActorIdentity.ts`,
`packages/core/src/declaration/validateModelVisibility.ts`,
`packages/core/src/models/make/makeQueryDbVersion.ts`,
`packages/core/src/contracts/validateAggregateCommand.ts`,
`packages/core/src/contracts/validateServiceCommand.ts`,
`packages/system-worker/src/AggregateVersionRepo/authorizeAggregateSession/authorizeAggregateSession.ts`,
`packages/system-worker/src/ServiceVersionRepo/authorizeServiceSession/authorizeServiceSession.ts`,
and `examples/shopping/src/zerospin/aggregates/user/actors/userActorV1.ts`.
