# Independent Agent releases and selected-row wakes

**Date:** 2026-11-18

**Status:** Current. Revises the scheduling and projection decisions in [Plan 309](../archive/plans/309-plan-agent-command-callbacks-and-pending-wakes.md).

**Supersedes:** [ADR 022](022-owner-local-agents-and-explicit-node-selection.md).

**Preserves:** [ADR 023](023-flat-command-origins-and-claims-free-continuations.md) command authority and [ADR 026](026-owner-local-system-spec-definition-registries.md) owner-scoped portable registries.

## Decision

An Agent release is independently declared and serves as its own session
definition. It binds one exact Aggregate or Service release using scalar owner
name/version, declares its selected view and ordinary contract grants, and owns
its callbacks. Its commands use the Agent's own identity. Owner releases register
supported contracts separately from invocation grants. Registering a contract
confers no System permission.

System registers Agents in owner-scoped `aggregateAgents` or `serviceAgents`
maps containing `{ releases, active }`. Replacing the active Agent does not
change owner composition or canonical history adoption. Portable Agent versions
remain immutable within the owner name and Agent name/version; each retains its
exact owner-release binding and projected model specs. System assembly validates
those views, wake rules and grants against the owner.

Agent selections use structured predicates over the declared view models and
fields. A relation predicate reads the related model’s selected rows. The
compiler rejects undeclared dependencies, cycles and opaque SQL such as
`where.RAW`. Each Agent release records `selectionSemantics: 'selected-rows'` in
its SystemSpec facts so the hash captures its selection semantics.
AggregateAgentVersionRepo and ServiceAgentVersionRepo compute selected deltas while materializing owner history. Agent Nodes install a snapshot, then compare named rule deadlines across each confirmed selected delta. Each rule supplies a deterministic deadline and a wake callback. The author declares the scheduling rule once for snapshot loading and subsequent changes.

The stable Agent Node Repo owns disposable model tables and selected rows,
processing position/hash, installation and initialization status, pending wakes,
producer progress, frozen command deliveries and unresolved optimistic inputs. It retains no
command execution history. Both Agent Node classes use `makeMigratableDORepo`.
Operational migrations validate the installed model tables in the final
migration transaction. The Agent runtime owns installation generation changes,
including rebuilding the selected view and abandoning old deliveries.

Selected changes, checkpoint and affected wakes commit synchronously together. Agent Chains retain selected history
independently of projection and Node delivery acknowledgements.

Before due wakes, the Agent catches up through a captured owner-history position.
The Node conditionally deletes the pending occurrence and runs its callback in the same transaction. Staging evaluates the granted ordinary contract on the optimistic selected view. Wake consumption, optimistic inputs and frozen deliveries commit atomically. An authored failure discards partial stages before `onFailure` runs. Admission acknowledgment retires only delivery. A matching confirmed command retires optimism, including on an empty selected delta.
If recovery succeeds, its effects commit and processing advances. If recovery
also fails, partial emissions are discarded and the wake remains pending.
Infrastructure failures and interruption roll back for retry.

Initialization only rebuilds pending wakes from a fresh selected snapshot. It
cannot emit commands or replay historical command callbacks. Removal or replacement permanently abandons outstanding command deliveries and
authored wakes. Each installation owns a generation and a producer sequence.
The stable Node records its next generation and clears the prior installation's
delivery and materialization state in a synchronous transaction. The owner
Chain fences admissions by generation. Commands already admitted remain in its
history, including commands whose acknowledgement was lost. A replacement
installs the new selected view, checkpoint and rebuilt wakes atomically. Same-name
re-addition also starts a fresh generation.

Failed installation persists an error and pauses callbacks. Explicit
`zerospin dev` or `zerospin deploy` retries against a fresh view. Ordinary alarms
and parent recovery do not retry a failed attempt. Every selected Agent is
initialized, including observation-only Agents and later-created Aggregate instances.
Browser observers remain independent of automatic callback execution.

## Consequences

Agent-only replacement no longer forces a new owner materialization. Projection Repos replay owner operations independently for each Agent version. Pending-wake bookkeeping
replaces attempted-row markers and leaves business late-work and idempotency
policies with the application author.

The author's active Agent release and its bound owner release identify the
installation. Declaring a new inactive release leaves the current installation
in place. Select the new release to replace it. Callback and helper changes
require a new authored Agent version, as in ADR 022. The CLI uses the ordinary
System Worker build.

During a redeploy, the System Worker and Agent Worker can switch versions at
different times. A changed Agent may briefly be unavailable and return a
retryable error until its new installation is available. This allows the two
Workers to activate independently while preserving the exact Agent release and
owner release selected for the installation.

A typed command reference supplies the exact command name and version under the
Agent’s owner binding. The Agent imports its payload type at compile time.
System assembly validates the grant and the owner contract supplies the runtime
codec.

SystemRepo rejects retained catalogs with Agents from earlier installation formats
before writes. This cutover preserves incompatible storage and its serving
runtime. Provider routing must keep that runtime serving when a candidate is
rejected. Catalog preflight also rejects retained Agent releases with
`selectionSemantics: 'owner-rows'` before writes. Authors declare a new Agent
release when they change its selection semantics.

Actor selection facts containing authored SQL use the `sql-selection-v2` encoding.
It distinguishes callback-scoped aliases from direct canonical table references
and records the SQL parameter encoding used by execution. Previously accepted Actor releases with such selections
are incompatible and are rejected before writes; they are not silently
reinterpreted. Ordinary declarative field filters and identity placeholders do
not receive this envelope. Identity placeholders with opaque custom SQL
encoders are rejected; normal default and canonical column encoders remain
supported.
