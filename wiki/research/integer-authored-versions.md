# Integer authored versions

**Date:** 2026-10-21

Zerospin's authored versions identify exact model, contract, actor, Agent and
aggregate/service release declarations. They use positive safe integers and
advance independently per named declaration. npm package versions retain
SemVer. This note records the evidence and the selected representation;
verification results belong to the implementation plan.

1. **SemVer encodes compatibility promises.** Its major, minor and patch fields
   classify incompatible API changes, compatible additions and compatible fixes.
   That distinction is useful for package releases, but it is not needed merely
   to identify an exact authored definition. [SemVer specification, sections
   1 and 6–8](https://semver.org/).

2. **Incrementing schema revisions have a first-party precedent.** Confluent
   assigns schema versions incrementing numbers while checking compatibility
   separately. A revision number and compatibility policy express different
   facts. [Confluent Schema Registry schema
   evolution](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html).

3. **Zerospin resolves exact identities through explicit lineage.**
   `resolveContractVersion` follows `previous` and `next` references and compares
   the requested version directly. `constructContractVersion` prevents repeated
   versions and multiple successors. Integer order does not allocate adapters or
   imply a payload conversion. [Exact contract resolution](../../packages/core/src/contracts/resolveContractVersion.ts),
   [contract construction](../../packages/core/src/contracts/make/constructContractVersion.ts).

4. **Unchanged declarations retain their identities across releases.** An owner
   release composes canonical models, public contracts and actor definitions;
   each has its own version. Updating a containing release does not by itself
   change those declarations. [Aggregate release construction](../../packages/core/src/aggregate/make/makeAggregateRelease.ts),
   [service release construction](../../packages/core/src/service/make/makeServiceRelease.ts).

5. **Numbers remain numbers through semantic boundaries.** The shared
   `VersionSchema` validates positive safe integers. Commands and complete resource
   envelopes retain numeric versions. Physical object keys and route segments are
   text, so registry validation compares canonical spelling and Repo routes use
   an explicit decimal-string codec. Model SQL rows omit `modelName` and `version`;
   `encodeRowAsResource` supplies the bound numeric version when forming a complete
   resource. [Version codecs](../../packages/core/src/declaration/VersionSchema.ts),
   [registry validation](../../packages/core/src/system/make/makeSystem/validateReleaseRegistries.ts),
   [command schemas](../../packages/core/src/contracts/CommandSchema.ts),
   [Repo names](../../packages/system-worker/src/makeDORepo/makeRepoNameUtils.ts),
   [model table construction](../../packages/core/src/models/make/makeModelVersion.ts),
   [resource encoding](../../packages/core/src/models/encodeRowAsResource.ts).

The cutover replaces string versions throughout the current development line.
It provides no legacy decoder or data translation. Changed physical schemas
require empty affected storage under the repository's pre-release policy;
deletion remains scoped to the maintainer's explicit reset authorization.
