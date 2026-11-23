---
name: zerospin-authorize-actors
description: >-
  Use when defining Zerospin actor authentication, admission authorization,
  selected read exposure, or authoritative write guards for application users.
metadata:
  purpose: Keep verified claims, read visibility, admission and canonical write policy in their owning boundaries.
  type: core
  library: '@zerospin/sdk'
  library_version: '37.1.0'
requires:
  - zerospin-parallel-models
---

# Authorize Zerospin actors

First load `pnpm exec intent load @zerospin/sdk#zerospin-parallel-models` and
apply its model-data invariant throughout this task.

1. Define backend actors and `makeActorIdentity` through `@zerospin/sdk`.
   Keep complete claims separate from the string fields selected by `actorPath`.
   Aggregate claims require `aggregateId`; authentication receives the requested
   aggregate ID and credentials. Verify credentials and ownership before
   returning claims. A requested ID or public input is not ownership proof.
2. Give application aggregate actors an explicit authentication policy. Services
   may deliberately use `authentication: 'none'` for public caller-supplied claims;
   those claims provide no authenticated ownership. Keep verification callbacks
   and provider secrets outside browser imports.
3. Declare each actor's `selections` object directly in its version declaration.
   Never extract selection maps into separate files, import or spread shared
   selection maps, or assemble them through selection builders. Keep actor-specific
   identity and SQL predicate constants in the same actor file; each actor owns its
   read policy even when another actor currently selects the same rows.
   Keep the actor query database canonical. Declare `exposedModels` separately for
   exposed fields, using valid limited models when hiding attributes. Selections
   use canonical `findMany` queries returning complete rows; no `columns`, `with`
   or `extras`. Filter rows with `identity.sql.placeholder` for `actorPath`
   fields. Omitted selections expose no rows. Public contracts require their
   projected read fields to be exposed; a model they mutate must still be fully
   exposed. Expose only intended commands in the actor's contract map.
4. Use `authorize` for session admission after authentication and exact-lock
   validation. Its reads cover owner models; omission adds no resource policy.
   For private exposure or aggregate provisioning, read
   [admission and visibility](references/admission-and-visibility.md).
   Never create an actor solely to issue a command from an `authorize` callback.
   Never create another actor solely to keep one contract out of another actor’s
   public contract map; consider a claims-free system command instead.
   Aggregate provisioning uses `authorize.executeCommand` with an owner-registered
   ordinary contract outside public actor/session contract maps. Service
   authorization has no corresponding command execution capability.
5. Put canonical aggregate write policy in
   `aggregateRelease.guards[actorName][commandName]`, and service write policy in
   the service actor's `guards[commandName]`. These run against authoritative
   state in the command savepoint. Read ownership there and return declared
   failures. Ordinary guards also run authoritatively; selection visibility
   does not grant write permission. External continuations are claims-free: their
   own guard/program receives `claims: null` and canonical reads, without an
   Actor-specific guard. Freeze any business identity needed later in payload
   and recheck current domain state there.
6. Treat each constructed Actor release's readonly `.spec` as its captured
   portable metadata. Actor factories build it after validation and selection
   capture; update helpers construct a fresh snapshot. Owner Releases embed that
   value, while compiled SystemSpec Actors use numeric Contract version bindings.
   Authentication/authorization callbacks, guards and executable codecs remain
   outside the spec immutability guarantee. Do not modify the snapshot or use it
   in place of runtime declarations or selected-version session locks.
7. Register exact actors/contracts/releases and run existing type/build checks
   plus relevant accepted/denied behavior. Report missing runtime evidence.

Accepted actor selections compare their authored declarative options and
identity references, not generated SQL. Explicit RAW expressions retain authored
SQL fragments and canonical model/column references; callbacks must be pure.
Changing policy still requires an actor revision. SQL compiler upgrades alone do
not. Pre-26 SQL-based catalogue/session state requires a hard cutover.
