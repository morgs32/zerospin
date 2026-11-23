# Owner-local SystemSpec definition registries

**Date:** 2026-11-03
**Status:** Accepted; framework implementation, coordinated verification and local adoption complete under [archived Plan 290](../archive/plans/290-plan-system-spec-definition-registries.md). Deferred connected application verification belongs to [Mentor Mailbox Plan 028](../../../mentormailbox/wiki/plans/028-plan-hub-student-workspaces-and-drafts.md).
**Amends:** only portable SystemSpec representation in [ADR 022](022-owner-local-agents-and-explicit-node-selection.md). Agent composition and selection are subsequently superseded by [ADR 029](029-independent-agent-command-callbacks.md); owner-scoped portable registries and runtime authority remain governing.

**Read-projection amendment:** Contract read requirements now carry selected
field shapes independently of their source model version. Decision points 2 and
3 below describe the original representation; exact release, Agent and mutation
bindings and the owner-local registries remain in force. See
[Plan 306](../plans/306-plan-contract-read-projections.md) for the cutover.

## Context

Mentor Mailbox's complete expanded SystemSpec reached 4,296,541 bytes, exceeding
the installed runtime's measured 4 MiB SQLite value limit. Canonical model bodies
were repeated in release models, Contract reads, mutation operations and Agent
models; unchanged Actors were repeated across owner releases. Every registered
release and existing canonical selection must remain intact. Actor exposed-model
projections can intentionally differ from complete canonical models with the same
name/version, so interning them by canonical identity would erase information.

The [library investigation](../research/system-spec-deduplication-libraries.md)
found no safe drop-in structural codec. A generic compression envelope would add
an opaque representation and decoding boundary while leaving the domain duplicate
ownership unresolved.

## Decision

1. Store complete canonical definitions once per Aggregate/Service owner in
   `modelVersions`, `contractVersions`, `actorVersions` and `agentVersions`, keyed
   by declaration name and exact version. Preserve every registered owner release
   and its `canonical` selection.
2. Release `models`, `contracts`, `actors` and `agents` contain exact numeric version
   bindings. System/external maps retain their exact command-version grants.
   Contract and Agent read-model maps bind canonical model versions; mutation
   metadata carries `{ modelName, version }`. Keep Actor `exposedModels` complete
   and inline in each Actor version, including limited projections.
3. Collect models from every release, Agent database and reachable Contract lineage
   read/mutation. Reject conflicting immutable version identities during compilation.
   Receiving schema boundaries validate registry identities and all model,
   Contract, Actor, Agent and release references, including explicit grants.
4. Hash complete normalized portable JSON, excluding its own hash field. SystemRepo
   still accepts one whole snapshot atomically and retains complete typed JSON.
   Compare owner-local model, Contract, Actor and Agent definitions independently
   of the enclosing release version, and compare exact release bindings separately.
   Earlier accepted snapshots continue protecting omitted facts. No separate
   component acceptance records or persisted deduplication dictionary are added.
5. Update public metadata consumers to resolve the same owner's registries. Native
   authoring objects, operation execution, browser lock formats, authorization and
   runtime admission keep their existing ownership and checks. Portable references
   never reconstruct executable capabilities.

## Consequences

The public SystemSpec shape and content hashes change. Consumers directly
inspecting metadata must resolve version bindings; diagrams and Studio do so in
their existing projection boundary. Owner-local registries require no global
cross-owner model identity or generic JSON codec and retain exact selected views.

This is a new-format-only pre-release cutover. Old expanded snapshots do not have
an alternate decoder, compatibility adapter or migration. Use separately authorized
fresh affected storage and preserve previous stores unchanged; this decision adds
no automatic reset. It authorizes neither production deployment nor public package
publication. Framework verification and local release adoption are recorded in archived Plan 290.
Connected application proof remains explicitly deferred in Mentor Mailbox Plan 028;
archival does not establish that proof or resume the checks.

The source workflow and exact citations are maintained in
[Authored System](../architecture/AuthoredSystem.md#native-declarations-and-portable-session-facts)
and [System API](../architecture/SystemApi.md#whole-systemspec-acceptance-and-hash-gates).
