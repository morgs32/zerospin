/*
 * Nonexecuting spike: in-place framework storage and Worker rollout.
 * Future production idea only. Current fixed-schema changes still require empty
 * storage; this file adds no compatibility path or deployment implementation.
 * See wiki/research/system-worker-storage-evolution.md, findings 1, 2, 5, and 8.
 *
 * Preserve bindings and DO identities:
 * packages/dev-worker/src/makeWranglerConfig.ts (makeWranglerConfig).
 * Each SystemRepo, VersionRepo, Chain, and child retains its own stored work.
 * Constructor-gated local migration runs before an RPC or alarm is processed.
 * Pending alarm ownership therefore stays local; no successor graph is created.
 * This does not cancel an external request already sent by older code.
 *
 * Storage revision describes a Repo kind's physical tables. Authored aggregate,
 * service, actor, and contract releases keep their existing meaning and locks.
 * Package semver and Cloudflare Worker version identify code releases; neither
 * is evidence that every database has migrated or every DO runs that code.
 */

// [3] Protocol overlap: establish release preconditions before touching a DO.
// Cloudflare can run different Worker code versions in different DOs.
// Unchanged inter-DO wire + migrations readable by overlapping code:
//   use the existing deployment flow; no whole-graph coordinator follows from
//   local schema evolution alone. Local migration/activation guards still apply.
// Breaking inter-DO wire, or incumbent code cannot read migrated tables:
//   TODO requireReleaseOverlapDecision(release); // undefined conceptual call
//   TODO if (!decisionEstablished) refuseDeployment("unsafe-code-overlap");
// Do not invent a universal protocol-version registry just to express this gate.
//
// Existing flow: packages/cli/src/deploy/deployWranglerFn.ts (deployWranglerFn).
// It stages candidate code, calls acceptSystemSpec through the candidate, then
// promotes. That candidate call already addresses the retained SystemRepo and
// could run its migration while incumbent code still serves other DOs.
// Therefore a production migration policy must cover candidate preflight too.
// TODO beforeFirstCandidateDOAccess(release) {
//   requireSafeStorageAndProtocolOverlap(); // undefined conceptual requirement
// }
//
// Existing promotion: packages/cli/src/deploy/utils/promoteCandidateDeployment.ts.
// Promotion to 100% and awaitSystemRepoVersion attest a deployment/addressed Repo;
// they do not establish an atomic code-and-storage upgrade of the entire graph.

// Local refusal sketch; complements the migration spike, not a rollback design.
// TODO beforeOwnerEvents(database, installedRelease) {
//   const applied = readAppliedStorageRevision(); // conceptual, undefined
//   if (!installedRelease.supportsStorageHistory(applied)) {
//     refuseActivation("unsupported-storage-revision"); // including old rollback
//   }
//   applyPendingLocalMigrations(); // conceptual; stamp atomically with each change
// }
// A supported older schema may need migration before this release can read rows.
// Reverting Worker code can fail after a destructive migration. Prefer forward
// correction; do not automatically run down SQL or replay recorded effects.
// An incompatible peer must not guess a decoder or silently reissue its work.
// TODO beforePeerCall(peer, operation) {
//   if (!releaseDecisionAllowsInteraction(peer, operation)) {
//     refuseInteraction("incompatible-runtime-protocol"); // conceptual only
//   }
// }
//
// Unresolved [3]: staged compatible change vs coordinated pause; the latter still
// needs authority/in-flight-work handling. A router pause does not stop alarms.
