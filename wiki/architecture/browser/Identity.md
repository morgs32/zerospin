---
title: Session Claims and Admission
updated: 2026-11-03
sources:
  - path: packages/browser/src/fetchAggregateSessionSnapshot.ts
    sha: 77b3dcb50d19adec02d41ee08d614eea6c84cec3
    lines: 1-79
  - path: packages/browser/src/fetchServiceSessionSnapshot.ts
    sha: efd2ef8eabd49029510e497b98826484e97846c8
    lines: 50-66
  - path: packages/system-worker/src/AggregateApi/authenticate/authenticate.ts
    sha: 8534d7bd018f35982903b5f136781ba41c045036
    lines: 1-47
  - path: packages/system-worker/src/ServiceApi/admit/admit.ts
    sha: 1aef0ac35cd0e531a1af02ec8458d913fdd25ee6
    lines: 31-55
  - path: packages/system-worker/src/AggregateApi/authenticate/authenticateAggregate/authenticateAggregate.ts
    sha: 28f98d562b567af628ca95eaa458dc8d383a3c22
    lines: 30-63
  - path: packages/system-worker/src/AggregateApi/authenticate/authenticateAggregate/utils/authenticateAggregateClaims.ts
    sha: 70dfdeb7f037a3376898d683a1e5c51eef06e3aa
    lines: 65-89
  - path: packages/system-worker/src/actorAdmission/utils/makeActorSelection.ts
    sha: adffe6e464c9bba8359731a092b81f0bc23714b5
    lines: 1-92
  - path: packages/system-worker/src/ServiceApi/admit/admitService/admitService.ts
    sha: 6019428250e7951895265708fef165c646caedd9
    lines: 21-46
  - path: packages/system-worker/src/AggregateAccessApi/openSession/openSession.ts
    sha: ecfabe67bf6459d2fc00f5ae554381d7bb2b6706
    lines: 1-113
  - path: packages/owner-release-worker/src/AggregateVersionRepo/authorizeAggregateSession/authorizeAggregateSession.ts
    sha: 8463578372366ccb397042cbd087a0ab762f0b4c
    lines: 1-183
  - path: packages/system-worker/src/AggregateVersionRepo/authorizeAggregateSession/validateAggregateSessionLock.ts
    sha: 8df0ea64cc911bb026f9356f0aecdea6651996bc
    lines: 33-59
  - path: packages/system-worker/src/ServiceAccessApi/authorize/authorize.ts
    sha: 89cb5c1b7986cc1cbf6883abcf923ea7093a508a
    lines: 41-74
  - path: packages/system-worker/src/AggregateSessionApi/getSnapshot/getSnapshot.ts
    sha: 15160c7b9513719b3ee0ce0576b99d63053e536c
    lines: 1-88
  - path: packages/system-worker/src/ServiceSessionApi/getSnapshot/getSnapshot.ts
    sha: 9a42c55f8133378ec5f7de8d69866674bb58df6b
    lines: 29-59
  - path: packages/core/src/identity/make/makeActorIdentity/makeActorIdentity.ts
    sha: b92d8d78da4263719c27659af25717a9e3cd9c61
    lines: 1-83
  - path: packages/browser/src/AggregateNode/makeAggregateNodeDefinition.ts
    sha: a2ee7730072a2b630fef91dcf9212be8313e4b8c
    lines: 1-32
  - path: packages/browser/src/ServiceNode/makeServiceNodeDefinition.ts
    sha: b382fbf0c243323d13a71b5050070543125aa2c5
    lines: 1-24
  - path: packages/core/src/Node/sessionKey.ts
    sha: 598424b848d5375c05b3e4ace4f67f4e004ee44c
    lines: 1-29
  - path: packages/browser/src/browserSession/makeCredentialsAdmissionProvider.ts
    sha: 1e8457eacaa301f3b11666cc30110be3791a1adf
    lines: 1-46
  - path: packages/browser/src/AggregateNode/resolveAggregateNode.ts
    sha: 9483a8920d5772200c2927df31340c496b0bc620
    lines: 25-186
  - path: packages/browser/src/ServiceNode/resolveServiceNode.ts
    sha: 05371ce2e6725fee590c349843f1ec2d7372f44b
    lines: 25-153
  - path: packages/browser/src/AggregateNode/makeAggregateSharedWorker.ts
    sha: e0d68e90d6a078fc1c236a5078f2f1e9c55727fe
    lines: 146-207
  - path: packages/browser/src/ServiceNode/makeServiceSharedWorker.ts
    sha: 0c77f5830408ee6d649576ff351171dc2cae4e6a
    lines: 49-220
  - path: packages/browser/src/browserSession/makeServiceAdmissionProvider.ts
    sha: 201c3ae351976259b132fee33e41835fc97439b1
    lines: 1-37
  - path: packages/browser/src/makeConnectedAggregateSession.ts
    sha: 82776e970ac58477e0f2295f060b52afb623826c
    lines: 1-291
  - path: packages/browser/src/makeConnectedServiceSession.ts
    sha: 3a8e961db5694000b9dfd503ff057f9a2cab69d4
    lines: 120-157
  - path: packages/system-worker/src/ServiceApi/admit/admitService/utils/authenticateServiceClaims.ts
    sha: 68972aa9d2b50fede549ab67d4fe269de0a38b3f
    lines: 33-74
  - path: packages/browser/src/AggregateNode/makeAggregateWorkerRuntime.ts
    sha: 1be24dfd3a5319077c098a40e19e84898466c1dc
    lines: 223-847
  - path: packages/browser/src/ServiceNode/makeServiceWorkerRuntime.ts
    sha: 5ee371557fcdfee5334437e43ad4b7b4eec64758
    lines: 168-885
  - path: packages/system-worker/src/ServiceAccessApi/authorize/authorizeServiceSession/authorizeServiceSession.ts
    sha: 21873b84b9efc9e23160a0ea534017fd8b406c6e
    lines: 39-68
  - path: packages/system-worker/src/ServiceAccessApi/authorize/authorizeServiceSession/validateServiceSessionLock/validateServiceSessionLock.ts
    sha: 811d5740a0ce00be61ef64504a019b0fb6326160
    lines: 52-75
  - path: packages/system-worker/src/serviceProjection/captureServiceSnapshot.ts
    sha: 1e9bb21a86dd270e4dd920b4ced4fdbc7e037efe
    lines: 59-141
  - path: packages/system-worker/src/serviceProjection/resolveServiceActorView.ts
    sha: c9fec637341113fac912b7e312fb6db9e9d76d73
    lines: 25-65
  - path: packages/system-worker/src/sessionLockValidation/requireSupportedSessionLock.ts
    sha: 29fcaaf1817c9d5d3f14fea16c2379cf041c539f
    lines: 39-49
  - path: packages/browser/src/sessionReplica/makeServiceReplicaReceiver.ts
    sha: 55e0f0acb53a372c6c0992bc75669b9271b559df
    lines: 1-313
  - path: packages/core/src/serviceSession/installServiceNodeView.ts
    sha: 5ec2f8926693e46a470619fac8ff0178533f8359
    lines: 1-201
  - path: packages/core/src/ServiceNode/acceptServiceOriginalTx.ts
    sha: 10cbb5670051be7d865696d3f7499fd42f22360a
    lines: 1-114
  - path: packages/browser/src/Node/makeNodeAuthentication.ts
    sha: 0c318c1ce3c83944de0a8aa7ba5fb620ff1c5aec
    lines: 32-166
  - path: packages/browser/src/Node/runNodeNetwork.ts
    sha: 92883fbf81f791bdde7c8416f7e2e687c8fcfd87
    lines: 19-59
  - path: packages/browser/src/Node/NodeErrors.ts
    sha: cd99055f7e292e2319001df19940439ac4d62642
    lines: 27-58
  - path: packages/browser/src/AggregateNode/makeConnectedAggregateConnection.ts
    sha: 9049c7037ae67f3d6a197116593dde0c70f807a0
    lines: 283-311
  - path: packages/browser/src/ServiceNode/makeConnectedServiceConnection.ts
    sha: 20637e42c633203acbd4d0d91f608a910462d000
    lines: 217-248
  - path: packages/browser/src/AggregateNode/aggregateNodeNetwork.ts
    sha: 94b2bb5c9c4fdbcae58fc037f32372d91c0b1946
    lines: 30-40
  - path: packages/system-worker/src/aggregateProjection/getSnapshot/getSnapshot.ts
    sha: 9f622ddb92bd58dbc8385372adeb88d4f2ca1f29
    lines: 46-95
  - path: packages/core/src/aggregateSession/makeInitializedAggregateSession.ts
    sha: 7d00a946796aa6fde3a8ad39ecf55b7505c19657
    lines: 16-30
  - path: packages/core/src/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema.ts
    sha: b78c300c6cf197df8ab9b325145f3d4df205a853
    lines: 40-53
  - path: packages/core/src/agent/AggregateAgentSessionSnapshotSchema.ts
    sha: fa38e9392883a5b2d0def8a5f084f164a3f3404a
    lines: 7-18
  - path: packages/browser/src/AggregateNode/aggregateNodeRequest.ts
    sha: 61e116bba8720719325cd295e4801c1158b11df7
    lines: 16-19
  - path: packages/browser/src/ServiceNode/serviceNodeRequest.ts
    sha: 3861ce4e4960fa2fb54f9d9afa28e63c8f9bcf64
    lines: 16-18
  - path: packages/browser/src/sharedWorkerNames.ts
    sha: 1928dbb3ee7a3787864ad2983ef295fcb006adb4
    lines: 7-27
  - path: packages/browser/src/Node/nodeStorageNamespaces.ts
    sha: 38e140ad9eff7ca563b12fbedc50a0200a512cab
    lines: 3-8
  - path: packages/browser/src/ServiceNode/ServiceBrowserSessionApi.ts
    sha: eae0570578537b0a0c80b58004797b29afd4c352
    lines: 141-153
  - path: packages/core/src/aggregateSession/make/makeAggregateSessionLock.ts
    sha: e44d3761b62343236ad40a8f71b30f5da56c6cb4
    lines: 15-30
  - path: packages/core/src/serviceSession/make/makeServiceSessionLock.ts
    sha: 77fb93d819d2dcb5f8897a2c4b4d87b94d491f53
    lines: 10-15
  - path: packages/core/src/system/project/projectSessionFacts.ts
    sha: c35d30f1cc8703b630d3b1843a92426c9779727e
    lines: 7-22
---

# Session claims and admission

Claims are the full admitted object. Retained provenance and wire identity preserve encoded claims; contract and selection execution use decoded values. Actor identity is the subset selected by `actorPath`; it identifies a partition within its owner scope. Actor resolvers keep decoded `selectionBindings` for SQL and canonical `encodedIdentity` for private ownership checks. Extra claims can preserve that partition while changing browser identity. Credentials belong to fresh authentication requests; snapshots, commands, tickets and durable Node identity retain admitted claims.

Aggregate actors declare credentials authentication. Admission validates the requested aggregate ID and credentials, authenticates, validates returned claims, and requires their aggregate ID to match. Service actors select direct claims or credentials authentication through their authored policy. Both paths directly resolve exact release/Actor, retain complete encoded claims and derive a reversible canonical Actor path before returning access. No durable audit write gates admission. Actor authorization is a separate owner-local state decision; refusal withholds the session capability.

- [`authenticateAggregate.ts:30-63`](../../../packages/system-worker/src/AggregateApi/authenticate/authenticateAggregate/authenticateAggregate.ts#L30-L63) — resolves exact Aggregate/Actor, authenticates claims and returns their full encoding with canonical path.
- [`admitService.ts:21-46`](../../../packages/system-worker/src/ServiceApi/admit/admitService/admitService.ts#L21-L46) — resolves exact Service/Actor and directly composes authentication, full claims and canonical path.
- [`authenticateAggregateClaims.ts:65-89`](../../../packages/system-worker/src/AggregateApi/authenticate/authenticateAggregate/utils/authenticateAggregateClaims.ts#L65-L89) — requires claims to match the requested Aggregate ID before encoding all claims.
- [`authenticateServiceClaims.ts:33-74`](../../../packages/system-worker/src/ServiceApi/admit/admitService/utils/authenticateServiceClaims.ts#L33-L74) — preserves direct-claims versus credentials policy and strictly validates/encodes the full result.

[ADR 017](../../adrs/017-admission-without-durable-audit.md) retires the former audit gate without treating optional diagnostics as equivalent durable history. [Plan 222](../../archive/plans/222-plan-remove-system-log-repo-and-admission-audit.md) records scoped verification completed on 2026-10-23: actual public Aggregate/Service admission, authorization and snapshots preserve complete claims and canonical paths while diagnostic delivery defects. The public wire error omits authored Cause detail, which remains in local capture. These Workerd invocations do not establish network RPC transport. Hosted-provider and browser lifecycle proof retain their separate scope.

Session locks contain the session name, exact Actor or Agent name/version, and selected model and ordinary contract names/versions. Owner coordinates travel beside the lock. Locks contain no schema shapes, indexes or claims codecs; the addressed owner release resolves the selected native declarations before comparison. Aggregate mapped bindings lock the public original, and external commands remain server-owned. Authors must advance declaration versions when changing shape or behavior: reusing the same identities no longer produces a different lock merely because the schema changed.

- [`makeAggregateSessionLock.ts:15-30`](../../../packages/core/src/aggregateSession/make/makeAggregateSessionLock.ts#L15-L30) — projects the Aggregate session name, Actor/Agent identity and selected members.
- [`makeServiceSessionLock.ts:10-15`](../../../packages/core/src/serviceSession/make/makeServiceSessionLock.ts#L10-L15) — projects the corresponding Service Actor identity and selected members.
- [`projectSessionFacts.ts:7-22`](../../../packages/core/src/system/project/projectSessionFacts.ts#L7-L22) — retains only model/contract names and versions from the native declarations.
- [`validateAggregateSessionLock.ts:33-59`](../../../packages/system-worker/src/AggregateVersionRepo/authorizeAggregateSession/validateAggregateSessionLock.ts#L33-L59) — resolves the exact Actor and selected members before comparing its canonical lock.
- [`validateServiceSessionLock.ts:52-75`](../../../packages/system-worker/src/ServiceAccessApi/authorize/authorizeServiceSession/validateServiceSessionLock/validateServiceSessionLock.ts#L52-L75) — resolves the Service Actor and selected members before comparing its canonical lock.

Aggregate Actor snapshots expose flat `actorName`, `actorVersion` and full encoded `claims`. `aggregateNodeNetwork` checks the response Actor release against the requested lock; Node authentication uses those actual claims. Requests between the session API and projection/history Repos carry flat caller Actor fields so each receiving Repo can compare them with its bound key before reading resources or private completion history. Local completion comparisons then use full claims, session name and Node ID within that validated Actor projection. The initialized Actor session reads Actor name/version from its immutable definition and retains decoded `claims` and detached `encodedClaims` separately. Actor snapshots and Actor execution do not retain an origin object. The declaration-shaped `aggregateSessionLock.origin` still identifies the selected Actor or Agent declaration; it does not carry runtime Actor claims.

- [`aggregateNodeNetwork.ts:30-40`](../../../packages/browser/src/AggregateNode/aggregateNodeNetwork.ts#L30-L40) — compares flat snapshot Actor name/version and session/aggregate release with the requested lock.
- [`getSnapshot.ts:46-95`](../../../packages/system-worker/src/aggregateProjection/getSnapshot/getSnapshot.ts#L46-L95) — rejects mismatched caller Actor/aggregate identity and claims outside the bound projection before capture.
- [`AggregateActorCommandSchema.ts:40-53`](../../../packages/core/src/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema.ts#L40-L53) — defines Actor snapshots with required flat Actor name/version, actual encoded claims and private resolution prefix.

Aggregate Agent snapshots retain their Agent origin and public checkpoint while omitting Actor name/version, actual claims and private resolution progress.

- [`AggregateAgentSessionSnapshotSchema.ts:7-15`](../../../packages/core/src/agent/AggregateAgentSessionSnapshotSchema.ts#L7-L15) — removes Actor-only snapshot fields and retains `AgentOriginSchema`.

Agent snapshots use the separate `AggregateAgentSessionSnapshotSchema`: their `origin` contains only Agent name/version and they omit Actor name/version, Actor claims and private `resolvedThrough`. `ActorOriginSchema` and `AggregateSessionOriginSchema` are removed; `AgentOriginSchema` remains for Agent snapshot and trusted-header identity.

- [`makeInitializedAggregateSession.ts:16-30`](../../../packages/core/src/aggregateSession/makeInitializedAggregateSession.ts#L16-L30) — defines initialized Actor identity through its session definition, decoded claims and encoded claims without an Actor origin field.
- [`AggregateActorCommandSchema.ts:40-53`](../../../packages/core/src/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema.ts#L40-L53) — declares flat Actor snapshot fields with the owning Aggregate/session context.
- [`AggregateAgentSessionSnapshotSchema.ts:7-18`](../../../packages/core/src/agent/AggregateAgentSessionSnapshotSchema.ts#L7-L18) — explicitly omits Actor fields/private progress and adds the Agent-specific origin.

## Trigger

1. The page connects using the known declaration/backend scope, plus requested aggregate ID for Aggregate sessions. Its admission provider remains on the page.
   - [`aggregateNodeRequest.ts:16-19`](../../../packages/browser/src/AggregateNode/aggregateNodeRequest.ts#L16-L19) — hashes the complete Aggregate request and requested aggregate ID without credentials or verified claims.
   - [`serviceNodeRequest.ts:16-18`](../../../packages/browser/src/ServiceNode/serviceNodeRequest.ts#L16-L18) — hashes the complete Service request for host routing.
2. The SharedWorker validates its registered declaration/lock and independently invokes this incoming attachment's admission callback. Backend admission and session authorization retain their existing exact release and Actor gates.
   - [`makeAggregateSharedWorker.ts:146-165`](../../../packages/browser/src/AggregateNode/makeAggregateSharedWorker.ts#L146-L165) — checks declaration/routing scope before discovery and credential acquisition.
   - [`makeServiceSharedWorker.ts:156-175`](../../../packages/browser/src/ServiceNode/makeServiceSharedWorker.ts#L156-L175) — performs the corresponding Service request validation before discovery.
3. The returned backend session capability captures an authenticated snapshot. The SharedWorker uses its complete verified identity to select a Node, retaining the proof for initial attachment.
   - [`resolveAggregateNode.ts:61-88`](../../../packages/browser/src/AggregateNode/resolveAggregateNode.ts#L61-L88) — checks selection/claims and retains the verified identity, environment and baseline.
   - [`resolveServiceNode.ts:50-70`](../../../packages/browser/src/ServiceNode/resolveServiceNode.ts#L50-L70) — retains the corresponding Service snapshot proof and admission value.

The service sequence shows the release, actor and session gates. Aggregate access
delegates authorization to its exact AggregateVersionRepo and requests the parallel
AggregateActorVersionRepo snapshot, which verifies exact publication and bounded
private history in its separate Chain. VersionRepos have already committed their
fixed finalized prefix during activation. Ordinary authorization and snapshots read
current committed materialization without forcing admitted commands to execute or
requesting source-tip replay. Authored explicit commands retain their normal
command-result workflow.

```mermaid
sequenceDiagram
  autonumber
  participant fetchServiceSessionSnapshot
  participant gatewayApi as gatewayApi: GatewayApi
  participant serviceApi as serviceApi: ServiceApi
  participant accessApi as accessApi: ServiceAccessApi
  participant authorizeServiceSession
  participant validateServiceSessionLock
  participant serviceRepo as serviceRepo: ServiceVersionRepo
  participant sessionApi as sessionApi: ServiceSessionApi
  participant view as view: ServiceActorVersionRepo
  fetchServiceSessionSnapshot->>gatewayApi: gatewayApi.service(...)
  fetchServiceSessionSnapshot->>serviceApi: serviceApi.admit(...)
  serviceApi-->>fetchServiceSessionSnapshot: admitted accessApi
  fetchServiceSessionSnapshot->>accessApi: accessApi.authorize(...)
  accessApi->>authorizeServiceSession: authorizeServiceSession(...)
  authorizeServiceSession->>validateServiceSessionLock: validateServiceSessionLock(...)
  validateServiceSessionLock-->>authorizeServiceSession: exact checked lock and session spec
  authorizeServiceSession->>serviceRepo: serviceRepo.authorizeServiceSession(...)
  serviceRepo-->>authorizeServiceSession: successful resource authorization
  authorizeServiceSession-->>accessApi: checked claims and session definition
  accessApi-->>fetchServiceSessionSnapshot: authorized sessionApi
  fetchServiceSessionSnapshot->>sessionApi: sessionApi.getSnapshot(...)
  sessionApi->>view: view.getSnapshot(...)
  view-->>sessionApi: selected resources, actual checkpoint, private prefix, claims
  sessionApi-->>fetchServiceSessionSnapshot: decoded coherent snapshot
```

## Annotated workflow steps

1. Select the exact service release through the gateway.
   - [`fetchServiceSessionSnapshot.ts:50-57`](../../../packages/browser/src/fetchServiceSessionSnapshot.ts#L50-L57) — The gateway binding includes publishable key, system, service name and exact version.

2. Submit the policy request with the lock’s actor identity.
   - [`fetchServiceSessionSnapshot.ts:58-62`](../../../packages/browser/src/fetchServiceSessionSnapshot.ts#L58-L62) — Admission adds exact actorName and actorVersion to the provider request.

3. Return an access capability only after admitted claims are established.
   - [`admit.ts:31-55`](../../../packages/system-worker/src/ServiceApi/admit/admit.ts#L31-L55) — admitService resolves admission before onSuccess constructs ServiceAccessApi with retained owner/actor binding.

4. Authorize the named session and its complete lock.
   - [`fetchServiceSessionSnapshot.ts:63-66`](../../../packages/browser/src/fetchServiceSessionSnapshot.ts#L63-L66) — The access capability receives sessionName and serviceSessionLock.

5. Bind authorization to the admitted actor and full claims.
   - [`authorize.ts:41-60`](../../../packages/system-worker/src/ServiceAccessApi/authorize/authorize.ts#L41-L60) — Lock actor mismatch refuses access; the domain procedure receives admitted claims and exact owner release.

6. Select canonical declarations and validate the whole lock.
   - [`authorizeServiceSession.ts:39-45`](../../../packages/system-worker/src/ServiceAccessApi/authorize/authorizeServiceSession/authorizeServiceSession.ts#L39-L45) — The supported-lock procedure runs before owner-local authorization.

7. Return the canonical expected session definition after one acceptance comparison.
   - [`validateServiceSessionLock.ts:62-96`](../../../packages/system-worker/src/ServiceAccessApi/authorize/authorizeServiceSession/validateServiceSessionLock/validateServiceSessionLock.ts#L62-L96) — The shared session projection constructs expected facts; requireSupportedSessionLock compares them and returns the expected lock, spec and actor.

8. Run state authorization on the exact materializing owner.
   - [`authorizeServiceSession.ts:47-60`](../../../packages/system-worker/src/ServiceAccessApi/authorize/authorizeServiceSession/authorizeServiceSession.ts#L47-L60) — ServiceVersionRepos selects the exact service release and receives the actor, session and admitted claims.

9. Consume the owner’s completed authorization envelope.
   - [`authorizeServiceSession.ts:51-61`](../../../packages/system-worker/src/ServiceAccessApi/authorize/authorizeServiceSession/authorizeServiceSession.ts#L51-L61) — Effect.promise and readRpcEnvelope propagate authorization refusal before capability publication.

10. Return the checked definition and admitted claims.
    - [`authorizeServiceSession.ts:63-68`](../../../packages/system-worker/src/ServiceAccessApi/authorize/authorizeServiceSession/authorizeServiceSession.ts#L63-L68) — The domain return carries canonical lock and spec with the full claims.

11. Construct the authorized session capability.
    - [`authorize.ts:61-74`](../../../packages/system-worker/src/ServiceAccessApi/authorize/authorize.ts#L61-L74) — The retained capability state includes system/owner release, actor path, session, claims and checked lock.

12. Request its authenticated snapshot.
    - [`fetchServiceSessionSnapshot.ts:68`](../../../packages/browser/src/fetchServiceSessionSnapshot.ts#L68) — Snapshot requests include nullable Node identity for private-prefix capture.

13. Delegate snapshot capture to the sole selected owner.
    - [`getSnapshot.ts:29-47`](../../../packages/system-worker/src/ServiceSessionApi/getSnapshot/getSnapshot.ts#L29-L47) — The key includes actor name/version/path; view.getSnapshot receives the admitted lock, full claims, session and Node.

14. Return the current committed graph and actual checkpoint together.
    - [`captureServiceSnapshot.ts:83-141`](../../../packages/system-worker/src/serviceProjection/captureServiceSnapshot.ts#L83-L141) — captures local selected resources/checkpoint N, publishes through N, verifies the separate Chain's exact index/hash and recovers private completion through N while preserving encoded claims without progress RPCs.

15. Decode the owner snapshot at the RPC boundary.
    - [`getSnapshot.ts:48-59`](../../../packages/system-worker/src/ServiceSessionApi/getSnapshot/getSnapshot.ts#L48-L59) — Schema.toType validates the native snapshot once and the public method returns its Success envelope.

## Complete identity and lock acceptance

- [`resolveServiceActorView.ts:25-65`](../../../packages/system-worker/src/serviceProjection/resolveServiceActorView.ts#L25-L65) — Actor-path decoding supplies decoded query bindings; re-encoding supplies canonical private partition fields.
- [`captureServiceSnapshot.ts:59-85`](../../../packages/system-worker/src/serviceProjection/captureServiceSnapshot.ts#L59-L85) — compares encoded identity fields and validates the full claims codec while preserving original encoded claims.

`requireSupportedSessionLock` makes one whole-lock structural comparison. Only after it fails does a diagnostic walk identify the first differing field. Model/contract availability selection remains a separate step: unsupported names or versions cannot masquerade as a changed definition. Service selection accepts current public declarations from the exact actor; aggregate selection preserves its explicit historical contract availability rules.

`validateAggregateSessionLock` returns the canonical projected session definition with the already validated Actor `origin` branch retained in its lock after whole-lock equality succeeds.

- [`validateAggregateSessionLock.ts:79-88`](../../../packages/system-worker/src/AggregateVersionRepo/authorizeAggregateSession/validateAggregateSessionLock.ts#L79-L88) — retains canonical session fields and the validated Actor lock origin in the returned session spec.

A live browser instance retains a detached copy of its first verified full claims across disposal and reinitialization. Later proof must match before capability publication. Changed full claims require a new instance, even if actorPath still selects the same partition. The complete owner, actor, session, lock and claims participate in Node identity; credentials and incidental compiled Worker versions do not replace that identity.

The Service tab replica derives service, Actor and session names from its bound
release, and command claims from its frozen full admitted identity. Its command
rows therefore omit those repeated fields. ServiceNode's ten-column command rows
also omit those fixed SQL copies and source contractVersion. Its immutable bound
definition and exact selected contract reconstruct complete names, full encoded
claims and source version for original protocol input, retry, recovery and dispatch.
New-original admission checks own registry membership, canonical command name and
exact incoming version before writes; full identity changes are rejected. Exact
retry compares all reconstructed input before current readiness/blocked/allocation
guards. ServiceNode has one complete-claims storage binding, with no standalone
Aggregate different-claims exception. Coherent view replacement, uncovered-local replay
and pending-command handoff use the same privately retained encoded claims.
Staging and validation decode fresh claims from that binding, and handoff retains
access to it while the public initialized capability is withdrawn. Mutable UI
state and a newly invoked credentials provider cannot supply command identity.

- [`makeServiceReplicaReceiver.ts`](../../../packages/browser/src/sessionReplica/makeServiceReplicaReceiver.ts) — freezes full encoded claims and passes them into coherent view installation.
- [`installServiceNodeView.ts`](../../../packages/core/src/serviceSession/installServiceNodeView.ts) — validates identity and compact coverage before replacing resources and replaying uncovered local input.
- [`acceptServiceOriginalTx.ts`](../../../packages/core/src/ServiceNode/acceptServiceOriginalTx.ts) — validates complete bound identity and exact selected original name/version before new writes.

- [`requireSupportedSessionLock.ts:39-49`](../../../packages/system-worker/src/sessionLockValidation/requireSupportedSessionLock.ts#L39-L49) — Acceptance uses one isEqual; a mismatch yields only the first-difference refusal.
- [`sessionKey.ts`](../../../packages/core/src/Node/sessionKey.ts) — Canonical hashing binds complete supplied identity.
- [`makeConnectedAggregateSession.ts`](../../../packages/browser/src/makeConnectedAggregateSession.ts) — The concrete aggregate instance retains its first verified full claims.
- [`makeConnectedServiceSession.ts:120-157`](../../../packages/browser/src/makeConnectedServiceSession.ts#L120-L157) — The service instance retains the same assertion across disposable lifetimes.

## Connected routing and authenticated storage

A connected `routingKey` selects a SharedWorker host for one exact declaration/backend request; Aggregate routing also includes the requested aggregate ID. This unverified routing fact grants no access to an identity's Node. After its own snapshot proof, each attachment joins an owner keyed by the complete authenticated `sessionKey`. Distinct full claims retain separate SQLite databases, pending commands, synchronization, diagnostics and sign-out state inside that host. Connected database and exclusive-lease names still contain the compiled `sharedWorkerVersion`; this is not cross-build persistence.

- [`sharedWorkerNames.ts:7-27`](../../../packages/browser/src/sharedWorkerNames.ts#L7-L27) — constructs connected host names from routing keys while Standalone keeps its session-key name.
- [`makeAggregateSharedWorker.ts:166-185`](../../../packages/browser/src/AggregateNode/makeAggregateSharedWorker.ts#L166-L185) — derives the authenticated key, checks revocation and reserves only that identity entry.
- [`nodeStorageNamespaces.ts:3-8`](../../../packages/browser/src/Node/nodeStorageNamespaces.ts#L3-L8) — constructs version-specific database names from authenticated session keys, independently of host routing.

Normal attachment consumes the host's own verified snapshot instead of asking a registered provider to authenticate again. `makeNodeAuthentication` still races proven providers for future reconnects; that shared provider mechanism cannot establish an incoming attachment's initial authority. Fresh storage installs the baseline once. Retained storage keeps its Node ID, original commands and checkpoint; recovery still requests a producer-specific snapshot when it needs the private completion prefix.

- [`makeAggregateWorkerRuntime.ts:824-847`](../../../packages/browser/src/AggregateNode/makeAggregateWorkerRuntime.ts#L824-L847) — registers a proved attachment's provider and selects its initial proof unless recovery invalidated it.
- [`makeServiceWorkerRuntime.ts:719-742`](../../../packages/browser/src/ServiceNode/makeServiceWorkerRuntime.ts#L719-L742) — preserves Service's corresponding reconnect provider and initial-proof distinction.
- [`makeAggregateWorkerRuntime.ts:223-253`](../../../packages/browser/src/AggregateNode/makeAggregateWorkerRuntime.ts#L223-L253) — recovery requests a snapshot for its explicit nullable Node ID and validates its identity/checkpoint/private prefix.
- [`makeServiceWorkerRuntime.ts:168-197`](../../../packages/browser/src/ServiceNode/makeServiceWorkerRuntime.ts#L168-L197) — validates the Service recovery snapshot with the retained producer's private completion prefix.

## Offline resolution and recovery

Offline resolution requires an explicitly offline browser or classified backend network unavailability, explicit expected full claims, the exact authored definition, and one eligible discovery match. An explicitly offline browser resolves its remembered identity before requesting credentials; losing connectivity during credential acquisition takes the same local branch. Provider errors while apparently online and business refusals do not establish server unavailability. A credential deadline may reopen only the same eligible local identity; it does not classify the backend as unreachable or grant synchronization authority. Remembered identity permits local recovery without creating a new partition; subsequent online synchronization still requires fresh server proof. Sign-out closes only the matching identity's join gate before awaiting cleanup, stops its synchronization and invalidates its discovery eligibility. The runtime clears Node authentication, attempts bounded signed-out delivery to its published capabilities, then detaches them. Unresolved discovery must recheck its original revision after the gate drains and before storage access or publication. Other identities remain usable; retained commands are preserved.

- [`resolveServiceNode.ts:25-73`](../../../packages/browser/src/ServiceNode/resolveServiceNode.ts#L25-L73) — requires exact expected claims and one eligible remembered Service identity; it never creates online authority.
- [`resolveAggregateNode.ts:25-81`](../../../packages/browser/src/AggregateNode/resolveAggregateNode.ts#L25-L81) — requires the matching Aggregate identity and additionally preserves its selected aggregate ID.
- [`makeServiceSharedWorker.ts:49-79`](../../../packages/browser/src/ServiceNode/makeServiceSharedWorker.ts#L49-L79) — sets the identity closing gate before revocation and retains it through runtime/storage/lease drainage.
- [`makeServiceWorkerRuntime.ts:872-885`](../../../packages/browser/src/ServiceNode/makeServiceWorkerRuntime.ts#L872-L885) — advances the generation, invalidates eligibility, clears authentication and notifies subscribers before detachment.
- [`ServiceBrowserSessionApi.ts:141-153`](../../../packages/browser/src/ServiceNode/ServiceBrowserSessionApi.ts#L141-L153) — bounds each subscriber's signed-out acknowledgement to one second.

While explicitly offline, AggregateNodeSynchronization and ServiceNodeSynchronization keep local state available, close any old socket, and schedule a later retry without acquiring credentials. Their push loops refuse delivery while offline. Credential deadlines and unavailable providers also keep synchronization nonterminal while fresh authentication cannot complete. On reconnect, the existing authentication and snapshot/ticket checks precede an open command socket; explicit refusals retain their existing rejection behavior.

- [`AggregateNodeSynchronization.ts:156-161`](../../../packages/browser/src/AggregateNode/AggregateNodeSynchronization.ts#L156-L161) — closes the old socket, publishes offline synchronization and schedules retry without calling a credential provider.
- [`ServiceNodeSynchronization.ts:142-147`](../../../packages/browser/src/ServiceNode/ServiceNodeSynchronization.ts#L142-L147) — closes the old socket, publishes offline synchronization and schedules retry without calling a credential provider.

Cold server activation reconstructs selection fields from the canonical partition path. Full claims remain retained completion/authorization identity. Fixed schema changes require empty server and browser storage. See [session WebSocket](./SessionWebSocket.md) for tickets, replay and connection phases.

## Authentication deadlines and publication fences

`makeNodeAuthentication` bounds each attached credentials provider independently to five seconds. The timer stops when credentials arrive; verification has its own deadline. An expired provider remains tracked until its Promise settles, so another round cannot duplicate it and its late credentials cannot start verification. One frozen provider cannot hide another provider's successful verification or a concrete backend refusal. Matching verification still compares the complete identity and generation before binding a capability.

- [`makeNodeAuthentication.ts:32-42`](../../../packages/browser/src/Node/makeNodeAuthentication.ts#L32-L42) — owns provider/pending maps and defaults the independent credentials timer to 5,000 ms.
- [`makeNodeAuthentication.ts:92-132`](../../../packages/browser/src/Node/makeNodeAuthentication.ts#L92-L132) — retains outstanding providers, expires credentials acquisition and refuses late verification.
- [`makeNodeAuthentication.ts:134-166`](../../../packages/browser/src/Node/makeNodeAuthentication.ts#L134-L166) — compares full verified identity and generation before selecting a successful provider.

Local discovery/snapshot preparation and backend network work have separate ownership. `runNodeNetwork` bounds the snapshot/ticket RPC to ten seconds and reports sanitized endpoint, operation and timeout diagnostics. `NodeErrors` distinguishes credentials timeout, local preparation timeout, backend timeout/unreachable and absence of a usable provider. These typed diagnostics contain no credentials or query values. Classified network unavailability can permit offline resolution with exact expected full claims; an authored rejection or malformed proof cannot.

- [`runNodeNetwork.ts:19-59`](../../../packages/browser/src/Node/runNodeNetwork.ts#L19-L59) — classifies network failures and applies the backend RPC deadline with sanitized endpoint/operation metadata.
- [`NodeErrors.ts:27-58`](../../../packages/browser/src/Node/NodeErrors.ts#L27-L58) — declares typed public diagnostics for the separate availability failures.

The tab's connected-worker startup deadline ends after host readiness and artifact/version validation. Identity-specific namespace acquisition occurs later during attachment with a separate fifteen-second local-preparation bound. Credential and backend verification retain their separate deadlines, preserving `node-subscription-timeout` instead of racing it against a generic startup failure. A fresh explicit `initialize({ retryConnection: true })` requests one eligible transport retry only after authentication; ordinary attach/resume cannot clear blocked persistence, projection, checkpoint, sign-out or admission state.

- [`makeConnectedAggregateConnection.ts:283-311`](../../../packages/browser/src/AggregateNode/makeConnectedAggregateConnection.ts#L283-L311) — ends host handshake timing after executable validation and sends unverified attachment inputs with the first-attachment retry option.
- [`makeAggregateSharedWorker.ts:186-207`](../../../packages/browser/src/AggregateNode/makeAggregateSharedWorker.ts#L186-L207) — bounds identity namespace acquisition and reports `node-local-preparation-timeout`.
- [`makeServiceSharedWorker.ts:196-220`](../../../packages/browser/src/ServiceNode/makeServiceSharedWorker.ts#L196-L220) — independently bounds Service namespace ownership under attachment cancellation.

See [Node view installation](./PushSequence.md#installing-a-captured-node-view) for same-row final resolution and checkpoint ownership, and [selected views](../server/SelectedViews.md) for private captured-prefix authority. Session identity and ticket capability checks do not themselves establish Chain admission, execution commit or retained `outcome`.
