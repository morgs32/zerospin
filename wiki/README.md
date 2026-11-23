# wiki

Zerospin-domain LLM guidance. First-party in this repository (not a Git
subtree). Start at [`patterns/README.md`](./patterns/README.md).

Use [`plans/README.md`](./plans/README.md) for active work, decision records,
and their archival conventions.

## Documentation ownership

[The docs app](../docs/README.md) owns developer concepts, authoring guides,
public API reference and examples. [Architecture](architecture/AuthoredSystem.md)
owns concrete runtime workflows and invariants, including the internals of
`@zerospin/system-worker`. Start with [SystemApi](architecture/SystemApi.md),
[queries and transactions](architecture/QueriesAndTransactions.md),
[selected views](architecture/server/SelectedViews.md),
[Agent execution](architecture/server/AgentExecution.md),
[delivery and recovery](architecture/server/DeliveryAndRecovery.md) or
[Repo lifecycle](architecture/server/RepoLifecycle.md).

Keep local implementation reasoning in source comments. Do not recreate nested
`packages/*/src/**/README.md` files. Package, example and operational test READMEs
keep their existing responsibilities. Plans, handoffs, ADRs and dated reviews
retain decisions, status and historical evidence; documentation consolidation
does not establish runtime acceptance of another plan.
