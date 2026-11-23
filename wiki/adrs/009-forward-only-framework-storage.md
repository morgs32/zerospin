# Forward-only framework storage

**Date:** 2026-10-12
**Status:** Accepted
**Implementation:** [Plan 139](../archive/plans/139-plan-migratable-do-repo.md).

## Context

Framework table changes must preserve authoritative receipts, pending work and alarm ownership. Rebuilding selected views also requires a deliberate socket/reconnection policy. Successor-owner cutover would introduce coordination beyond local schema evolution.

## Decision

All nine System-Worker owners use one local migration lifecycle. Each DO retains an immutable, checksummed, up-only history. Fresh storage provisions the current graph and stamps its represented history atomically; existing storage applies pending SQL and its stamp in one synchronous transaction per migration. Confirm those writes before proceeding so constructor failure preserves the committed prefix.

History and physical-schema mismatches refuse activation before recovery. Authored definitions remain immutable and separate from framework storage revisions. Physical identities and alarm ownership remain unchanged.

## Alternatives and consequences

Parallel successor owners require cutover coordination; discarding views requires an explicit rebuild/reconnect policy. Local migration keeps existing ownership at the cost of retaining migration history and rejecting older code that cannot support stored revisions. Correct committed mistakes with a new migration; there are no down migrations.

The initial pre-release baseline requires empty storage. Runtime Worker relocation and changes to external-effect semantics remain separate work.
