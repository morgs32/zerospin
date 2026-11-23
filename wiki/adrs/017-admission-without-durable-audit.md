# Admission without durable audit storage

**Date:** 2026-10-16
**Status:** Accepted. [Plan 222](../archive/plans/222-plan-remove-system-log-repo-and-admission-audit.md) implements the retirement; scoped verification completed on 2026-10-23 with 101 passing System Worker tests across 25 files, scoped consumer typing/builds/lint and source-preservation checks.
**Supersedes:** only the mandatory admission-audit preservation clause in [Plan 143](../plans/143-plan-optional-effect-telemetry.md). Its optional telemetry architecture and separate unfinished provider proof remain governing. No prior governing ADR is replaced.

## Context

SystemLogRepo's only remaining domain responsibility was permanent admission-attempt auditing. AggregateApi and ServiceApi waited for a begin RPC before authentication and a completion RPC before returning access. Audit storage failures could block successful authentication or replace its original failure, while no authorization, command, replay or session-recovery decision read the retained attempts. Plan 143 preserved that feature during the telemetry cutover and expressly left its necessity unresolved.

The [table review](../reviews/storage-tables/system-log-repo-admission-attempts.md) found no separate durable-audit requirement. Keeping an entire owner and mandatory cross-Repo writes solely to preserve old diagnostics is not justified by the access model.

## Decision

1. Remove SystemLogRepo, admissionAttempts, begin/complete audit procedures, auditAdmission, audit-only claims hashing/result baggage and all owner binding/export/service/inspection/configuration consumers. Preserve no alias, optional owner, replacement SQL table, audit outbox or diagnostic fallback.
2. AggregateApi and ServiceApi admission resolve exact release/Actor, run the existing authentication policy and credential/claims validation, validate the canonical Actor partition and return full encoded claims and actorPath to their access capabilities. Aggregate-ID agreement, exact Actor identity, authored callback Cause handling and all later session-lock/resource authorization remain required. These checks do not depend on diagnostic persistence.
3. Admission no longer promises an acknowledged local attempt record, unfinished-on-interruption evidence or terminal audit retention. Audit-write failure priority disappears; actual authentication/identity failures remain the domain failures. No transaction or rollback guarantee is invented around authored authentication callbacks.
4. Retain existing named admission spans, local Effect capture and source-owned optional/sampled OTLP export. Diagnostic failures preserve the domain result. Optional hosted delivery is not an equivalent permanent unsampled audit trail, and this decision makes no provider-arrival or indexing guarantee.

## Consequences

Authentication no longer requires two SystemLogRepo RPCs. Full claims and canonical identity remain in their actual capability/provenance paths; only the duplicate audit copies and unused admission digest disappear. Browser StandaloneNode's independent claims hashing and command/history persistence are unchanged by this decision.

The removal is a pre-release source/configuration hard cutover. Supported Repo kinds, service layers, native bindings, fresh-storage Wrangler declarations and existing consumers omit the deleted owner. This implementation adds no deployed deletion migration and performs no namespace/data deletion, storage reset or deployment. Existing storage/deployment transition planning remains separate from writing and verifying the source change.

Plan 222 records real public Aggregate/Service admission, subsequent authorization and selected snapshots, preserving original results when WorkerTelemetry.emit defects. Authored Cause detail remains in local capture and absent from public wire errors. Actual dev/production generation matches all seventeen Repo bindings/classes; representative native/PartyServer activation records registration metadata. All 837 captured production source/schema files remain unchanged in that verification. These proofs establish no network RPC transport, exhaustive activation of every kind or deployed storage transition. Plan 143's hosted-provider arrival/indexing proof remains separate and this governing ADR stays active. Historical telemetry checks do not imply a current rerun or provider delivery.
