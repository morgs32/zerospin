/**
 * Design spike for self-hosted Zerospin. Calls below are pseudocode.
 *
 * One stable Worker per System instance hosts ingress, the registry,
 * AggregateChains and ServiceChains. Each owner release has an execution
 * Worker. Browsers pin an owner release and Actor version and can issue
 * commands against the same Aggregate instance from different releases.
 */

// 1. Publish an owner release alongside the releases callers still use.
async function installUser2(bundle, spec, executionConfig) {
  // Patch compatible server-only code on the existing release Worker and
  // preserve its Durable Object namespaces, declaration pins and saved output.
  // A pending original resumes on that release with its existing ID and
  // position. A committed success or failure recovers its saved evaluation.
  // Record executable versions with deployments for inspection.
  const release = await stable.reserveAggregateRelease("user", 2, digest(bundle, spec, executionConfig))
  await provider.createOrVerifyPrivateWorker("shopping-user-r2", release, bundle, executionConfig)
  await provider.configureServiceBindings("shopping", { USER_R1: "shopping-user-r1", USER_R2: "shopping-user-r2" })
  await stable.makeRoutableAfterVerification(release, "USER_R2")
  // Keep the stable Chain namespaces. The release Worker hosts the
  // VersionRepos, VersionChains and archives served by that release, with
  // separate Repo instances for individual Aggregate IDs.
  // Cloudflare service bindings: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/
}

// 2. Bind the owner and Actor releases when issuing the ticket. Persist the
// addressed owner release with the original command before dispatch.
async function openBrowser(request) {
  const { aggregateName, aggregateVersion } = request.ownerAndActor
  const worker = stable.bindingForAggregateRelease(aggregateName, aggregateVersion)
  const scope = await worker.aggregate(request.ownerAndActor)
    .admit(request.admission).authorize(request.sessionAndLock)
  return stable.issueSocketTicket({ scope })
  // Stable verifies the ticket on connect. For a Service session, the scope
  // carries the Service release and its Actor version. The socket reads the
  // scoped Actor projection from its cursor and follows Chain finalizations.
  // Resume from the durable cursor after a missed notification. The existing
  // session lock identifies the browser Node journal and SharedWorker.
  // Starting point: packages/browser/src/createAggregateSessionWebSocketTicket.ts
}

async function submitToAggregate(session, frozenCommand) {
  const chain = stable.aggregateChain(session.systemId, session.aggregateName, session.aggregateId)
  const retry = await chain.lookupProducerPosition(session, frozenCommand)
  if (retry) return chain.resumeOrAcknowledgeStoredAssignment(retry)
  const worker = stable.bindingForAggregateRelease(session.aggregateName, session.aggregateVersion)
  const head = await chain.readFinalizedFrontier()
  const repo = worker.aggregateVersionRepo(session.aggregateId, session.aggregateName, session.aggregateVersion)
  // Check any recorded predecessor checkpoint before replaying the remaining positions.
  await repo.prepareThrough(head)
  const validation = await worker.validateForAdmission(session, frozenCommand, head)
  // Validate the exact command, scope, owner release and frontier.
  // Recheck these and the producer in one admission transaction.
  // Retry preparation if another command won the race.
  const position = await chain.admitAtFrontier(head, session, frozenCommand, validation)
  const result = await repo.executeOrReadOriginal(position, frozenCommand)
  await chain.recordOriginalCommandOutcomeTx(position, result)
  // Recover the addressed release, ID and position if the reply is lost.
  // A compatible patch of that Worker can resume the same pending original.
  // Before admission a preparation failure consumes no position. The
  // ServiceChain uses the System instance and Service name as its address.
  return result.outcome
}

// 3. Carry forward saved results for one release. Opt into a predecessor
// snapshot when introducing a distinct Aggregate release.
//
// Agreed: user@2 can name user@1 as its predecessor. On Alice's first
// initialization, install a verified full snapshot and fix its starting
// checkpoint, for example command 41. Persist the predecessor release,
// position and command ID for this Aggregate instance and destination
// Aggregate release. Keep the inherited evaluated history through 41 readable.
// The starting checkpoint remains fixed as the materialization head advances.
//
// Above that point user@2 uses ordinary parallel replay. If user@1 executes
// command 42, user@2 evaluates it under its own release and keeps its own
// result. The views can diverge. Every Shop browser deployment that pins
// user@2 addresses the same saved materialization for Alice.
// See wiki/research/zerospinner-replay-decisions.md.
async function replayNext(repo, admitted) {
  if (admitted.aggregateVersion !== repo.aggregateVersion) {
    // Restore this release's saved result before evaluating the command.
    // The stable Chain supplies its verified, finalized history in order.
    // If this release has no command binding, record a local unsupported
    // outcome and advance with zero model operations. Keep the original
    // outcome. Gaps, unavailable history and missing required adapters
    // pause replay. Apply the same rule to ServiceChain input.
    return repo.replayAsParallelOwnerRelease(admitted)
  }
  const source = stable.locateOriginalOutput(repo.owner, admitted.index)
  // Finalization can precede publication. Look in the original Repo's durable
  // publication outbox, then its VersionChain or archive. A verified retained
  // copy can also serve the original.
  const evaluated = await source.readOriginalEvaluatedCommand(repo.owner, admitted.index)
  // See packages/system-worker/src/AggregateVersionRepo/readEvaluatedCommand/findEvaluatedCommand.ts.
  // Require the original record for this command and position, compatible model
  // declarations, and the same preceding model state. A disposition hash covers
  // command identity, order and outcome. Proof of model equality remains open.
  await repo.checkRestorePreconditions(admitted, evaluated)
  await repo.restoreEvaluatedCommandTx(evaluated) // Applies model operations only.
  // See packages/system-worker/src/AggregateVersionRepo/replayCommands/replayCommand.ts
  // and packages/system-worker/src/AggregateVersionRepo/utils/restoreEvaluatedCommandTx.ts.
  // The ServiceVersionRepo has the same missing-original check and restore path.
}

// 4. Keep the Agent Worker independently deployable.
async function sendAgentCommand(installation, outboxEntry) {
  // One Agent Worker per System instance holds its installed Agents, selected
  // tables, callbacks, wake registries and outboxes. Each Agent binds an exact
  // owner release. The stable Chain consumes the frozen destination in the
  // outbox entry after verifying the installation and producer position.
  return stable.submitAgentCommand(installation.identity, outboxEntry)
  // A follow-on command binds its destination owner and release in its
  // recorded operation. A continuation returns to the recorded source
  // release. Replay applies model changes without sending old work again.
  // Starting point: packages/system-worker/src/agentNodeRepo/agentInstallation.ts
}

// 5. Preserve reads when the Chain compacts inputs or a Worker is retired.
// Core keeps a bounded admission suffix and adopts published canonical history.
// Resolve that adopted prefix by owner release and boundary. Retain the
// originating evaluated command and addressed release across compaction.
// A canonical source can have its own result for the same admitted position.
// Retire manually after verifying that live pins, pending work or required
// history can all be served by the surviving releases and history sources.
// See wiki/adrs/025-canonical-published-history-handoff.md.
