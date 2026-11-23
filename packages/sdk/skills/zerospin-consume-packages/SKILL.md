---
name: zerospin-consume-packages
description: >-
  Use when installing or upgrading Zerospin in a consumer application, choosing
  where framework fixes belong, or coordinating a framework package release
  with consumer adoption.
metadata:
  purpose: Preserve framework and consumer ownership across exact package releases.
  type: core
  library: '@zerospin/sdk'
  library_version: '46.0.0'
---

# Consume published Zerospin packages

Install exact published versions of the framework packages the application
uses, including `@zerospin/system-worker`. Keep Zerospin's fixed release-group packages
on one exact version; independently versioned forks retain their own pins.
Use the consumer's declared package manager, registry configuration, manifests,
and lockfile. Do not substitute the framework checkout's package manager or
change global registry configuration.

The Zerospin source checkout owns framework source changes, builds, registry
startup, and publication. Make framework fixes there, commit the scoped changes,
and publish from a clean checkout of that revision. Preserve unrelated work.
Consumers install the resulting packages rather than editing installed files,
building copied framework sources, or adding workspace/file links to bypass
publication.

Keep application models, commands, integrations, and consumer adaptations in
the application and its existing patch mechanism. A local domain package whose
name includes Zerospin remains application-owned; it is not the framework source.

Before deploying a framework upgrade that changes fixed storage or whose
compatibility is unknown, identify the executing Worker version and its exact
SDK artifact. Compare the candidate's SQL, migration ledger, and serialized
records. Use read-only inspection of live namespace bindings, actual objects,
and affected Repos to distinguish compatible storage, empty namespaces, an
incompatible SystemRepo catalog, and incompatible owner history. Reuse the
Worker, System identity, and namespaces wherever the evidence supports it.
Incomplete inspection leaves compatibility unknown. Follow the
[deployment storage preflight](https://github.com/morgs32/zerospin/blob/main/docs/content/guides/develop-and-deploy.md#inspect-storage-before-a-framework-rollout)
before staging. Any storage reset requires explicit authorization.

The 46.0.0 recorded-command outcome cutover requires fresh System storage.
An existing pre-cutover SystemRepo catalog is rejected with
`recorded-command-storage-reset-required` before activation or catalog writes.
Identify each affected development or production instance and its owner Chain
storage before rollout. Reset only instances explicitly authorized by the user;
a development reset does not authorize deleting production state, keys, archives,
or unrelated provider data. Coordinate browser Node and discovery state so old
pending commands are not replayed against a newly empty System.

After adoption, verify exact pins and a frozen-lockfile install, load the
installed Intent skills, and run the consumer's existing relevant checks through
Nx when configured. Publication alone does not prove consumer or runtime behavior.

## Deliver the System registry rule to consumer AGENTS.md

Use the consumer's installed matching `@zerospin/cli`; do not download a replacement.
From the repository root, run `pnpm exec zerospin configure-agents-md --dry-run`
to review and `pnpm exec zerospin configure-agents-md` to install or refresh the
SDK's literal System registry rule. If invoking from a backend workspace package,
pass `--directory` explicitly to select the repository root. The command does not
search parent directories or load application configuration.

Preserve Intent's skill-loading block and all unrelated AGENTS.md text. Review
and commit the resulting managed block. After framework upgrades, explicitly
refresh it and review the diff; in CI after dependency installation, use
`pnpm exec zerospin configure-agents-md --check` from the same root. Check and
dry-run never write. Malformed markers must be resolved explicitly, not hidden
with another block. Presence and freshness do not prove agent compliance.

For any proposed `system.ts` change, present exact before-and-after snippets and
obtain the user's approval before making it. The agent may then make the approved
changes.
