# Server-unreachable session diagnostics

Source review on 2026-10-17. This is a review of the proposed diagnostic change,
not an implementation or runtime-verification record. The authored upstream
browser/error packages and QRK's Studio dependencies are currently `13.0.0`.
Sources: [browser package](../../packages/browser/package.json#L1-L4),
[error package](../../packages/error/package.json#L1-L4),
[Studio dependencies](../../../qrk.sh/apps/studio/package.json#L30-L36).

## Recommendation

Keep `node-offline-identity-missing`. Prefer this small correction to the
previously agreed phrase "the app cannot open locally":

> Cannot reach the Zerospin server. No saved session matches this identity, so this session cannot open locally.

This wording is a recommendation, not a record of additional approval. The
failure belongs to a particular session; see finding 7.

At the aggregate and service resolver's discovery call, reconstruct only that
specific runtime discovery failure and retain the **resolver-visible connection
failure's code/message in `cause`**. Do not promise to retain the original native
fetch failure: an earlier browser network boundary already removes its diagnostic
cause. This recommendation follows the current resolver branches, public error
serialization, and formatter described in findings 1–4 below.

## Numbered review findings

1. **Observation: the resolver owns the combined explanation.**
   `resolveAggregateNode` and `resolveServiceNode` first obtain admission outside
   their network catch. They then request a snapshot. Only
   `node-network-unavailable`, or `rpc-invocation-failed` with
   `extra.networkUnavailable === true`, permits offline discovery. Other snapshot
   failures are rethrown. Missing expected claims has its own error before the
   discovery call. Successful offline discovery still returns an attachment with
   `online: false`. Sources:
   [aggregate admission and network predicate](../../packages/browser/src/AggregateNode/resolveAggregateNode.ts#L16-L68),
   [aggregate offline attachment](../../packages/browser/src/AggregateNode/resolveAggregateNode.ts#L69-L85),
   [service admission and network predicate](../../packages/browser/src/ServiceNode/resolveServiceNode.ts#L16-L64),
   [service offline attachment](../../packages/browser/src/ServiceNode/resolveServiceNode.ts#L65-L77).

   **Recommendation:** attach the connection context at these two resolver calls,
   leaving the discovery registries responsible for local identity selection.
   These are the inspected production callers of their respective `find`
   methods. Sources:
   [aggregate call](../../packages/browser/src/AggregateNode/resolveAggregateNode.ts#L65-L68),
   [service call](../../packages/browser/src/ServiceNode/resolveServiceNode.ts#L61-L64).

2. **Observation: “missing” means no eligible exact identity match.**
   Both registries hash the complete `{ request, claims }` and select only
   eligible matching entries. Zero matches produce
   `node-offline-identity-missing`; multiple matches produce
   `node-offline-identity-ambiguous`. Their missing-error construction supplies
   only `code`, so the current constructor supplies the reviewed default message
   and null `status`, `extra`, and `cause`. Sources:
   [aggregate identity selection](../../packages/browser/src/AggregateNode/aggregateSessionDiscovery.ts#L93-L135),
   [service identity selection](../../packages/browser/src/ServiceNode/serviceSessionDiscovery.ts#L92-L134),
   [constructor defaults](../../packages/error/src/ScopedError.ts#L22-L31),
   [current missing/ambiguous catalog entries](../../packages/error/src/defaultErrorMessages.ts#L548-L555).

   **Inference:** the error does not establish that all browser data is absent or
   that storage should be deleted. The proposed wording correctly refers to a
   matching identity. A future direct caller of discovery would not, by itself,
   establish server unreachability; the agreed catalog wording relies on the
   current resolver-owned call sequence. Sources:
   [aggregate predicate and lookup](../../packages/browser/src/AggregateNode/resolveAggregateNode.ts#L50-L68),
   [service predicate and lookup](../../packages/browser/src/ServiceNode/resolveServiceNode.ts#L46-L64).

3. **Observation: `ensureZerospinError` cannot enrich this existing error.**
   It returns an existing local runtime `ZerospinError` immediately, ignoring
   fallback code, message, extra, and status. `isZerospinError` recognizes the
   runtime schema, whose declaration requires a local `ZerospinError` instance.
   Explicit `makeZerospinError` creates a new runtime error and accepts all fields
   required for the proposed guarded copy. Sources:
   [runtime recognition and construction](../../packages/error/src/makeZerospinError.ts#L7-L62),
   [normalization pass-through](../../packages/error/src/makeZerospinError.ts#L88-L110),
   [documented normalization contract](../../packages/error/README.md#L41-L70).

   **Recommendation:** guard with `isZerospinError(discoveryError)` and the exact
   missing code, then copy `code`, `message`, `status`, and `extra` into a new
   runtime error. Supply `cause: prettyUnknownFailure(connectionError)`. Rethrow
   every other discovery rejection unchanged. This keeps the shared catalog as
   the wording owner and avoids interpreting arbitrary rejected objects as
   runtime errors. Sources:
   [maker and guard](../../packages/error/src/makeZerospinError.ts#L33-L62),
   [formatter](../../packages/error/src/makeZerospinError.ts#L64-L85).

4. **Observation: earlier browser normalization already discards native causes.**
   Aggregate and service snapshots both pass through `runNodeNetwork`.
   `nodeNetworkProgram` converts a ten-second timeout to
   `node-network-unavailable`. For a single expected failure, it calls
   `encodeError(reason.error)` and constructs a new runtime error from that public
   JSON. The JSON schema has no `cause` field and recursively removes `cause` and
   `stack` keys from framework `extra`. `BrowserRpc.run` itself throws a single
   typed rejection unchanged. Sources:
   [aggregate snapshot boundary](../../packages/browser/src/AggregateNode/aggregateNodeNetwork.ts#L20-L28),
   [service snapshot boundary](../../packages/browser/src/ServiceNode/serviceNodeNetwork.ts#L20-L28),
   [network timeout and normalization](../../packages/browser/src/Node/runNodeNetwork.ts#L28-L60),
   [public JSON fields](../../packages/error/src/encodeError.ts#L5-L15),
   [extra filtering](../../packages/error/src/encodeError.ts#L34-L68),
   [public serialization](../../packages/error/src/encodeError.ts#L96-L108),
   [Promise rejection behavior](../../packages/browser/src/Node/BrowserRpc.ts#L5-L18).

   **Inference:** adding a resolver cause can retain the error that the resolver
   actually receives, but cannot recover an earlier native stack or discarded
   cause. `prettyUnknownFailure` formats a runtime error as code, distinct
   message, and any surviving cause; it does not include that error's `status`
   or `extra`, and limits text to 8,000 characters. Sources:
   [runtime formatting](../../packages/error/src/makeZerospinError.ts#L64-L85),
   [network reconstruction](../../packages/browser/src/Node/runNodeNetwork.ts#L50-L53).

   **Recommendation:** correct the plan's diagnostic promise rather than widen
   this change into `getApi`, `runNodeNetwork`, or public-codec changes. Public
   backend cause stripping is an intentional privacy boundary, documented
   separately from full diagnostic serialization. Source:
   [serialization and privacy](../../packages/error/README.md#L112-L122).

   **Predicted diagnostic examples, not observed runtime output:** an anchored
   fetch `TypeError` is classified by `getApi` as `rpc-invocation-failed` with a
   message such as `RPC getSnapshot at http://127.0.0.1:8788 failed before a usable
   result was available.` The actual method and sanitized endpoint come from the
   failed invocation; the example endpoint is illustrative. A deadline instead
   yields `node-network-unavailable: The backend could not be reached within the
   Node's connection deadline.` Both fetch paths invoke `getSnapshot`. These
   messages establish failed reachability, not that a server process is stopped;
   neither resolver's fallback predicate consults `navigator.onLine`. Sources:
   [RPC classifier and message](../../packages/core/src/utils/getApi/getApi.ts#L104-L124),
   [aggregate snapshot invocation](../../packages/browser/src/fetchAggregateSessionSnapshot.ts#L70),
   [service snapshot invocation](../../packages/browser/src/fetchServiceSessionSnapshot.ts#L68),
   [deadline conversion](../../packages/browser/src/Node/runNodeNetwork.ts#L28-L35),
   [deadline default](../../packages/error/src/defaultErrorMessages.ts#L536-L539),
   [aggregate predicate](../../packages/browser/src/AggregateNode/resolveAggregateNode.ts#L50-L61),
   [service predicate](../../packages/browser/src/ServiceNode/resolveServiceNode.ts#L46-L57).

5. **Observation: the new resolver cause can reach the current UI unchanged.**
   Aggregate/service connectors call `onProtocolFailure(error)` with the runtime
   error before separately encoding Node state. Bootstrap forwards that callback
   while current, browser-session creation reports it as a session failure, and
   `makeSessionFailureReporter` copies its cause into a fresh occurrence. React
   passes `store.failure` to the configured renderer. QRK's renderer copies the
   cause into diagnostic JSON and renders a Cause section. Sources:
   [aggregate connector](../../packages/browser/src/AggregateNode/connectAggregateNode.ts#L390-L409),
   [service connector](../../packages/browser/src/ServiceNode/connectServiceNode.ts#L401-L420),
   [aggregate forwarding](../../packages/browser/src/bootstrapAggregateSession.ts#L226-L233),
   [service forwarding](../../packages/browser/src/bootstrapServiceSession.ts#L226-L233),
   [aggregate reporting](../../packages/browser/src/makeBrowserSession/createAggregateBrowserSession.ts#L101-L105),
   [service reporting](../../packages/browser/src/makeBrowserSession/createServiceBrowserSession.ts#L83-L87),
   [fresh failure occurrence](../../packages/core/src/sessionFailure/makeSessionFailureReporter.ts#L36-L43),
   [React renderer](../../packages/react/src/makeReactApp/makeReactApp.tsx#L128-L134),
   [QRK renderer selection](../../../qrk.sh/apps/studio/components/ZerospinUser.tsx#L30-L33),
   [QRK diagnostics](../../../qrk.sh/apps/studio/app/error.tsx#L25-L40),
   [QRK Cause section](../../../qrk.sh/apps/studio/app/error.tsx#L125-L130).

   **Limit:** connectors separately suppress this protocol-failure report when
   the browser reports offline, subject to their authentication/persistence
   conditions. The UI prediction applies when reporting is reached; it is not a
   new claim about browser-offline behavior. Sources:
   [aggregate suppression](../../packages/browser/src/AggregateNode/connectAggregateNode.ts#L381-L388),
   [service suppression](../../packages/browser/src/ServiceNode/connectServiceNode.ts#L392-L399).

6. **Observation: remembered identity discovery is runtime-version scoped.**
   The browser build hashes its SharedWorker runtime plus WASM content. Aggregate
   and service discovery include that hash in their IndexedDB database names.
   **Inference:** rebuilding can select another discovery namespace even when old
   data remains present; no pre-upgrade remembered-session eligibility guarantee
   follows from this diagnostic change. **Recommendation:** validate reopening
   using an identity established in the same runtime namespace, preserving old
   browser data and performing no reset. Sources:
   [runtime version declaration](../../packages/browser/src/sharedWorkerVersion.ts#L1-L2),
   [content hashing](../../packages/browser/tsup.config.ts#L32-L47),
   [aggregate namespace](../../packages/browser/src/AggregateNode/aggregateSessionDiscovery.ts#L31-L35),
   [service namespace](../../packages/browser/src/ServiceNode/serviceSessionDiscovery.ts#L30-L34).

7. **Inference and recommendation: scope the wording to the session.**
   The reporter sets failure on its owning session store; React renders that
   session's error. Independent application sessions can therefore have a
   different outcome. The shared catalog's phrase "the app cannot open locally"
   can overstate the affected scope. Prefer "this session cannot open locally"
   while retaining the rest of the agreed wording and existing code. Sources:
   [session-owned terminal publication](../../packages/core/src/sessionFailure/makeSessionFailureReporter.ts#L49-L59),
   [session-owned renderer](../../packages/react/src/makeReactApp/makeReactApp.tsx#L127-L134).

8. **Observation: release metadata requires a fixed group, not two package bumps.**
   The `zerospin` release group lists 19 distributable projects, uses
   `projectsRelationship: "fixed"`, and resolves the current version from disk.
   With the inspected `13.0.0` manifests, a patch plan implies `13.0.1`; that is a
   release assumption, not a claim that `13.0.1` is available in the registry.
   Sources: [release policy](../../nx.json#L62-L94),
   [browser version](../../packages/browser/package.json#L1-L4),
   [error version](../../packages/error/package.json#L1-L4),
   [documented patch workflow](../../README.md#L169-L183).

   **Observation:** `pnpm release` explicitly disables staging, commits, tags,
   and pushes; publication is a separate command against local Verdaccio.
   Sources: [release wrapper](../../scripts/release.mjs#L26-L54),
   [publication workflow](../../README.md#L185-L193).

   **Recommendation:** verify registry availability and version vacancy before
   publishing, isolate the approved upstream patch from unrelated local work,
   and update QRK's exact dependencies/lockfile after publication. Both checkouts
   contained unrelated modified files during this inspection; that is an
   observation from read-only `git status --short`, not a release artifact.
   Existing policies require staying within scope and preserving intentional
   local wiring. Sources: [upstream scope](../../AGENTS.md#L3-L7),
   [QRK working rules](../../../qrk.sh/AGENTS.md#L18-L21),
   [QRK exact current dependencies](../../../qrk.sh/apps/studio/package.json#L30-L36).

## Minimal corrected implementation recommendation

1. Settle the small session-scoped wording correction in finding 7, then replace
   only the default catalog text for `node-offline-identity-missing`. The
   constructor reads this catalog when no explicit
   message is provided. Sources:
   [catalog entry](../../packages/error/src/defaultErrorMessages.ts#L552-L555),
   [constructor precedence](../../packages/error/src/ScopedError.ts#L22-L31).
2. Add the same guarded rejection transformation to the existing aggregate and
   service discovery calls. Keep credential acquisition, the network-unavailable
   predicates, successful discovery, and all other failures unchanged. Sources:
   [aggregate resolution](../../packages/browser/src/AggregateNode/resolveAggregateNode.ts#L16-L85),
   [service resolution](../../packages/browser/src/ServiceNode/resolveServiceNode.ts#L16-L77).
3. Retain the narrower resolver-visible diagnostic promise from finding 4. No
   raw-transport preservation, storage recovery, retry behavior, new error code,
   shared helper, named type, or wire field is needed for this recommendation.
   This is a scope recommendation based on the existing maker and resolver
   ownership, not a claim that implementation has been verified. Sources:
   [error maker](../../packages/error/src/makeZerospinError.ts#L33-L45),
   [aggregate discovery boundary](../../packages/browser/src/AggregateNode/resolveAggregateNode.ts#L50-L85),
   [service discovery boundary](../../packages/browser/src/ServiceNode/resolveServiceNode.ts#L46-L77).

## Planned validation and limits

The validation below is recommended coverage, not a request to introduce test
infrastructure. Upstream forbids new test files, fixtures, runners, and their
configuration without an explicit user request. QRK defers standalone automated
checks and backend integration suites. Sources:
[upstream testing rules](../../AGENTS.md#L17-L23),
[QRK testing rules](../../../qrk.sh/AGENTS.md#L52-L63).

1. Exercise both permitted network-unavailable predicates in each resolver,
   followed by zero matching identities. Require the existing code, exact settled
   message, unchanged discovery status/extra, and resolver-visible connection
   code/message in `cause`. Sources:
   [aggregate predicate](../../packages/browser/src/AggregateNode/resolveAggregateNode.ts#L50-L68),
   [service predicate](../../packages/browser/src/ServiceNode/resolveServiceNode.ts#L46-L64).
2. Establish a session online and reopen it with an unavailable connection in
   the same runtime namespace. Require successful remembered discovery and the
   existing offline attachment; preserve all old data. Sources:
   [aggregate offline result](../../packages/browser/src/AggregateNode/resolveAggregateNode.ts#L69-L85),
   [service offline result](../../packages/browser/src/ServiceNode/resolveServiceNode.ts#L65-L77).
3. Check pass-through for admission/authentication rejection, missing expected
   claims, ambiguous identity, storage/discovery rejection, and other errors.
   These are separate existing branches; the proposed guard must not recategorize
   them. Sources:
   [aggregate resolver](../../packages/browser/src/AggregateNode/resolveAggregateNode.ts#L16-L70),
   [service resolver](../../packages/browser/src/ServiceNode/resolveServiceNode.ts#L16-L64),
   [aggregate discovery failures](../../packages/browser/src/AggregateNode/aggregateSessionDiscovery.ts#L93-L135),
   [service discovery failures](../../packages/browser/src/ServiceNode/serviceSessionDiscovery.ts#L92-L134).
4. With the browser still reporting online, verify the reconstructed cause in
   the existing QRK Cause section and copied diagnostic JSON. Finding 5 proves
   the source path, not a live result. Also retain existing browser-offline
   reporting behavior; do not change it to make this check pass. Sources:
   [connector reporting condition](../../packages/browser/src/AggregateNode/connectAggregateNode.ts#L381-L408),
   [QRK diagnostic payload](../../../qrk.sh/apps/studio/app/error.tsx#L25-L40),
   [QRK Cause rendering](../../../qrk.sh/apps/studio/app/error.tsx#L125-L130).

No production code, tests, builds, releases, dependency installations, browser
state, storage, or long-running processes were changed or exercised in this
research. Registry release availability has not been verified.

## Implementation status (2026-10-17)

The reviewed diagnostic is implemented: the shared catalog uses the
session-scoped wording, and both resolvers reconstruct only the missing-identity
discovery rejection with the resolver-visible connection failure in cause.
Sources: [catalog](../../packages/error/src/defaultErrorMessages.ts#L552-L555),
[aggregate guard](../../packages/browser/src/AggregateNode/resolveAggregateNode.ts#L69-L87),
[service guard](../../packages/browser/src/ServiceNode/resolveServiceNode.ts#L65-L83).

Execution evidence reported by the release owner: upstream checks and builds
passed, along with 16 in-memory resolver scenarios. All 19 fixed-group packages
were published as `13.0.1`; registry versions, latest tags, and package integrities
were verified. Release metadata was propagated from the isolated release
checkout, preserving unrelated working changes and the original upstream
lockfile. Sources for release scope and recorded version:
[fixed release group](../../nx.json#L62-L94),
[release entry](../../CHANGELOG.md#L1-L5).

QRK adoption is complete: all 28 existing framework dependency pins across its
five consuming manifests are exact `13.0.1`, the package-manager update refreshed
the lockfile, and a frozen offline install passed. The installed error package
was evaluated directly and produced the approved session-scoped message.
Sources: [Studio dependencies](../../../qrk.sh/apps/studio/package.json#L30-L36),
[consumer lockfile](../../../qrk.sh/pnpm-lock.yaml).

Live verification in the existing Chrome profile at
`http://localhost:3000/morgs32` displayed the approved message and this Cause:

```text
rpc-invocation-failed: RPC getSnapshot at http://127.0.0.1:8788 failed before a usable result was available.
```

The Copy diagnostics control acknowledged `Copied`; automated clipboard
readback returned an empty string, so the copied JSON contents were not
independently verified through that API. The diagnostic object construction
continues to include the same cause. Sources:
[diagnostic object](../../../qrk.sh/apps/studio/app/error.tsx#L25-L40),
[Cause presentation](../../../qrk.sh/apps/studio/app/error.tsx#L125-L130).

No backend or browser storage was reset, and no public error codec changed.
The earlier source-review snapshot and its limitations remain historical
evidence. Remaining work for this diagnostic change: None.
