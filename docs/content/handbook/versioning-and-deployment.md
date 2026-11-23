---
title: Versioning and deployment
description: Keep declarations, browser code, storage, and deployed backend versions coherent during pre-release development.
order: 10
---

## Reuse the owner Chain across releases

Adding or promoting an owner release keeps the same owner Chain when the
System identity, owner identity, bindings, and framework storage are compatible.
`AggregateChain` is keyed by `systemId`, Aggregate name, and Aggregate ID.
`ServiceChain` is keyed by `systemId` and Service name. Each release has its
own VersionRepo and VersionChain and materializes its models by replaying the
shared retained command history.

When `AggregateChain` first enrolls an Aggregate release for an instance, it
records how far it has admitted commands. If it has admitted through 10, the
release gets positions 1–10 from its named predecessor and receives positions
11 onward from `AggregateChain`. With `branchFrom`, it inherits the
predecessor's evaluations through 10. With `rebuildFrom`, it evaluates those
inputs itself. If the predecessor has published only through 8, the new release
waits for positions 9–10 to publish. Releases enrolled together for the same
instance use the same admitted position.

For a Service, register V10 beside canonical V9 and verify V10 can publish
its evaluated history. When V10 becomes `canonical`, `ServiceChain` continues
reading its adopted prefix from V9 until V10 publishes through the boundary.
Original execution and browser sessions follow their own exact release bindings.

If you are also changing framework versions, check storage compatibility for
that version jump before deploying. [Deployment storage preflight](/guides/develop-and-deploy#inspect-storage-before-a-framework-rollout)

## Version the behavior you author

Models, contracts, actors, aggregate releases, and service releases each have exact version identities. A versioned declaration is an executable agreement about shape, behavior, selection, or policy. It is distinct from the version of an npm package containing the machinery.

Register owner versions explicitly in `makeSystem`. Browser session definitions bind an exact owner version and actor version; command occurrences retain exact contract versions. A backend and browser built from incompatible declarations can disagree on payload, result, or selected resource shape even when a package name still matches.

Session locks carry the session name, Actor or Agent name/version, and selected
model and contract names/versions. Their owner release is bound by the surrounding
request. They contain no schema documents; the addressed AggregateVersionRepo or
ServiceAccessApi resolves its canonical declarations and validates the selected
versions. The browser storage identity follows those names, versions, and
selections. Advance the declaration version when its shape or behavior changes;
reusing a version no longer gains an additional structural mismatch check from
the lock. Native codecs still validate actual payloads, claims, results, and
resources.

Keep current-source examples on one workspace revision. These docs do not promise that a registry package with the manifest's version has the same API. The [quickstart](/guides/quickstart) uses workspace dependencies deliberately.

## Add functionality through a new release

Adding a new contract is the normal way to add functionality. Declare the new
contract, grant it to the intended Actor, Agent or System entry point, and
compose a new aggregate/service release that includes it. Recorded provider work
also needs its exact backend external implementation in that release's
`external` map. Keep the existing releases registered while consumers adopt the
new release.

A frontend adopts the feature by selecting the new exact `aggregateVersion` or
`serviceVersion` in its session definition, with the matching Actor version,
contracts, claims and visible models. For example, a feature introduced in Users
release 5 requires a session selecting release 5, or a later release that still
supports the feature. The session binds one exact integer version, not a `>= 5`
range. Sessions bound to release 4 continue to address release 4.

Older registered releases still replay the shared command history. A release
that does not support the new contract should retain a contract-support refusal
for that command and continue replay. Its refusal is local to that release; it
does not undo successful execution in the release that supports the feature.
Introducing a new contract does not require adding it to historical releases or
inventing an upgrade edge from an unrelated contract. Evolving an existing
contract identity does require its actual predecessor lineage and the adapters
needed by the releases that continue supporting that contract.

After validating the candidate, update the intended consumers' exact release
bindings. A Service can adopt a different published history by selecting a
new `canonical` release. Review that change separately from consumer adoption.

To retire an old release, omit it from `releases` and deploy the new SystemSpec.
First check remaining sessions, recorded cross-owner destinations, pending
external work and retained source declarations. Keep an Aggregate release
registered while another registered release names it as a predecessor.
Historical contracts and Actors must remain executable wherever retained
commands still need them. Existing storage survives release omission.

See [contract-support refusals](/handbook/releases-and-systems#contract-support-refusals)
and the [promotion and retirement sequence](#add-and-validate-consider-promotion-or-retirement).

## Upgrade domain declarations explicitly

Upgrading an existing model or contract is mandatory when evolving that
identity. Use its supported upgrade constructor and the actual previous
declaration object. For a contract, calling `make*ContractRelease` again under
the same name with a higher version number creates a disconnected declaration,
even when its payload is identical. A contract upgrade records the executable
history edge. A model upgrade instead inherits and patches attribute/index
descriptors; it does not create contract adaptation edges or migrate model rows.

A change to operations, read models, guards, programs, or results still needs a
new version and preserved lineage when the payload is unchanged. Retained
admitted commands keep their original contract versions. Those versions must
remain supported by at least one registered aggregate/service release, directly
or through its actual contract lineage. Keeping a source file or an earlier
accepted SystemSpec does not provide executable support.

Use the supported authoring functions for each declaration:

| Function                                                            | Change                                                                                                              |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `upgradeModelVersion`                                               | New model version with attribute/index patch; `null` removes an existing attribute                                  |
| `upgradeAggregateContractRelease` / `upgradeServiceContractRelease` | New canonical contract release with payload/model patch, explicit program, and payload `up`/optional `down` Effects |
| `updateAggregateActorRelease`                                       | New aggregate actor release with explicitly changed fields and merged named contracts/selections                    |
| `updateServiceActorRelease`                                         | New service actor release; selections merge, while overridden capability fields use the supplied declarations       |

An ordinary contract upgrade inherits an omitted result codec. Declare a new result codec when the domain result changes; a new contract without a result codec returns void completion. Payload conversion callbacks describe a declared version edge, not a catch-all fallback decoder. Keep each authored version in its own file and update all in-scope callers, owner releases, and session bindings together.

A new external request version declares its pure payload, response codec and
timeout. Its backend implementation supplies the request and both continuation
branches. The emitting release interprets its retained observation before
admitting an ordinary command. Evolve the admitted payload with ordinary
contract upgrades and adapters. [External work](/handbook/external-work)

## Add and validate; consider promotion or retirement

Service promotion changes which release supplies adopted history.

Contract versions and owner release versions are separate. Updating `createUser`
from contract 1 to contract 2 requires an upgrade edge. An owner release that
selects contract 2 is a new composition; it does not replace the registered
release that previously selected contract 1 automatically.

1. Finish the model, ordinary-contract, and external-contract upgrades before
   calling `makeSystem`. Preserve each predecessor and the declarations needed
   to decode retained admitted commands.
2. Add the new release alongside the existing releases. For an Aggregate, name
   the predecessor with `branchFrom` or `rebuildFrom`. For a Service, keep the
   existing `canonical` selection while validating the candidate. Keep existing
   invocation and session bindings until the candidate is ready.
3. Materialize the new release against the retained history and inspect its
   outcomes, progress, and application invariants. Verify required payload and
   recorded-external-outcome adaptation paths and cross-owner destinations.
   Older registered releases also consume newer admitted commands. When an
   older release continues supporting an evolved contract, provide the required
   reverse adapters, including explicit identity adapters when the payload is
   unchanged. If a valid newer input cannot be represented by the older
   contract, the ordinary or recorded external `down` adapter can return
   `DownAdapterRefused` from the SDK. After validating the
   source command, replay records the executing release's unsupported outcome
   and advances. Missing adapters, unexpected failures and invalid output
   still stop replay. A new contract absent from that release also records a
   release-local unsupported outcome.
   Do not treat successful SystemSpec acceptance as evidence of this check.
4. Adopt the validated release in the intended exact browser and command
   bindings. Verify original execution and replay on the existing storage.
   To promote a Service, verify the candidate can supply the adopted prefix
   before changing `canonical`.
5. Review old-release retirement separately from adoption or promotion.
   Omit a release only when its required historical contracts, Actors, external
   continuations, predecessor references, session bindings, pending work, and
   history obligations remain supported.

`makeSystem` checks Aggregate predecessor references and the Service
`canonical` selection. Verify retained replay and retirement eligibility after
SystemSpec acceptance. See
[releases and systems](/handbook/releases-and-systems#build-the-system-registry).

## Replace browser bundles before removing an Aggregate release

Suppose browser sessions use V9 and you introduce V10 as another branch from
V8. Existing browser sessions keep their exact V9 Aggregate and Actor releases.
Publish the browser bundle that selects the V10 Aggregate release and its
matching Actor release while V9 is still registered. Verify that the new bundle
loads and connects before removing V9.

Once V9 is removed, an open V9 tab can receive an unavailable-release error.
Refresh the page to load the latest app. If a fresh page still requests V9,
check that the frontend is serving the new bundle and that its session
definition matches the deployed System's releases.

Refreshing does not carry incompatible local-only commands into the new session.
Before removing V9, review admitted commands and retained history separately and
keep the declarations they still require executable.

## Separate framework schema cutovers from domain upgrades

Compare the deployed and candidate framework versions when fixed storage
changes or compatibility is unknown. The pre-release policy requires empty
affected storage unless a supported upgrade path is explicitly approved.
Identify the affected stores before deciding how to proceed. [Deployment storage preflight](/guides/develop-and-deploy#inspect-storage-before-a-framework-rollout)

Connected browser AggregateNode and ServiceNode storage has two upgrade paths.
A change to a selected resource table or the code that materializes its rows
rebuilds that view from a retained checkpoint and history or an authenticated
snapshot. The Node preserves the producer, pending originals and retained
outcomes. With a suitable retained checkpoint, this works offline.

Changes to the durable command representation require an explicit,
transactional forward migration. The Node verifies the stored schema and its
recorded migration history. A migration that requires draining originals waits
for final outcomes and can require connectivity. An unsupported format or an
outstanding command requirement that the current runtime cannot execute leaves
the previous work in place. Pre-baseline runtime-hash databases require an
explicit cutover with the previous compatible runtime. See
[connected storage](/reference/browser#connected-browser-storage-upgrades).

An explicit `zerospin dev --clean` starts a new local backend history under the
same System ID. A connected browser that previously verified the replaced
history can register a fresh producer in a separate storage namespace. The old
SQLite file and tab journals stay with their original history. Ordinary
restarts reuse the current history. Production storage and standalone
`reset()` have separate lifecycles.

## Reboot a System

A **System reboot** establishes an independent, empty Zerospin catalog and
command history, then starts the intended System declarations as initial
releases. Choose it when the existing history in the affected environment is
intentionally disposable. A reboot can use a new `systemId`, or reuse an ID
after the affected catalog and owner storage have been explicitly cleared.
Changing an ID selects another System and leaves the old System's data in place.

Author each initial Aggregate and Service release with the intended models,
contracts, Actors, Agents and external implementations. Bind sessions, System
API callers, Agent Nodes and command destinations to the new System and its
exact release versions. Seed the fresh System and use commands for subsequent
model changes. Starting at version 1 is appropriate for a new history. Retained
history requires the original declarations and their evolution paths.

Identify backend stores, browser Nodes and pending commands, and any external
objects or provider records separately. Decide what to preserve or reset for
each affected environment. Local backend cleanup affects backend storage.
Browser and external storage have separate lifecycles, and a reset requires
explicit authorization. Verify retained-history compatibility separately from
fresh-state tests. See
[local cleanup](/guides/develop-and-deploy#clean-disposable-local-storage) and
[deployment preflight](/guides/develop-and-deploy#inspect-storage-before-a-framework-rollout).

## Run the authored config

Export `makeConfig({ system, systemId })` from `zerospin.config.ts`. The CLI loads that config and validates the companion `ownerReleaseSources` export. It compiles the complete portable SystemSpec, then generates an entrypoint and Wrangler configuration for each release that needs a new executable.

- `zerospin dev` pins the authored SystemSpec at startup and checks it against local history before serving. Reloads continue while its hash matches. When the hash changes, finish editing the declarations and restart `zerospin dev` to check the new spec.
- `zerospin studio` opens the local Declaration Board from that config, without an API connection or secret key. Zerospin Cloud provides active-instance Repo/table inspection.
- `zerospin seed <file>` runs the named `seeds` Effect program through the typed administrative API; the program checks each command outcome and owns sequential order.
- Run `zerospin deploy` from your laptop to verify and promote a staged
  candidate. The CLI reports **Live** after the System initializes.

Use the [CLI reference](/reference/cli) for options, environment variables, and the meaning of a successful command. Serving the frontend alone does not prove the backend is ready.

## Verify the entire consumer boundary

Before a rollout, check declarations and the consumer browser bundle together, then check authoritative execution and any provider continuation. A browser query rendering correctly does not prove an ownership guard or checkout finalized successfully.

For repository work, use existing Nx targets and example checks. Shopping's application browser verification is prohibited by its project instructions; verify its contracts and Workerd seams instead. That constraint does not prevent inspecting independent documentation or Studio fixtures.

Keep provider secret keys server-side; only the API URL and publishable key belong in browser configuration. Deploy matching backend and frontend source, verify readiness, and observe domain finalization/error events. The [development and deployment guide](/guides/develop-and-deploy) supplies the runnable sequence.
