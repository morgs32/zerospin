# 296 — Make owner Chain reuse and deployment storage preflight explicit

**Status** — Implemented and verified. Documentation and shipped skill guidance only.

## Outcome

A developer adding or promoting an owner release should immediately see which
Chain stays in place, which release materializes the history, and which proof
permits canonical history handoff. An operator upgrading Zerospin should be
able to identify the affected storage and make a scoped rollout decision
without treating an incompatible catalog as an owner Chain failure.

Use the existing [Canonical History Handoff](../../architecture/server/CanonicalHistoryHandoff.md),
[ADR 025](../../adrs/025-canonical-published-history-handoff.md), and
[QRK production evidence](../../research/qrk-production-owner-chain-reuse.md).
The QRK evidence is a dated example. Check the owning source and release notes
before describing support for any other release pair.

## Implementation

1. **Lead with owner Chain reuse in Fragment.** In
   [Versioning and deployment](../../../docs/content/handbook/versioning-and-deployment.md),
   add a short section before the versioning workflow. For the same
   `systemId` and owner identity on compatible framework storage,
   `AggregateChain` is keyed by System, Aggregate name and Aggregate ID.
   `ServiceChain` is keyed by System and Service name. Neither includes the
   owner release version. Each release has its own VersionRepo and VersionChain.
   The candidate materializes from shared retained history. The owner Chain
   reads the adopted prefix from the previous VersionChain and its Archives
   until the newly selected canonical release durably publishes through the
   prior boundary. Original execution and browser sessions retain their exact
   bindings. In [Releases and systems](../../../docs/content/handbook/releases-and-systems.md),
   put a short pointer beside the first explanation of `canonical`.
2. **Add a conditional preflight to Fragment's deployment guide.** Route readers
   there from the handbook's fixed-schema section and from the guide's deploy
   steps before staging a backend. Invoke it when the exact deployed-to-candidate
   framework jump changes fixed storage or its compatibility is unknown. An
   authored-only release on compatible storage follows the replay and promotion
   checks. Replace the guide's broad empty-storage wording with the scoped
   policy from AGENTS.md, retaining disposable local cleanup and the separate
   browser Node upgrade guidance.
3. **Specify what the preflight must establish.** Identify the live executing
   Worker version and match it to the deployed SDK artifact, then compare the
   exact candidate and intervening changes for SQL, migration ledger and
   serialized records such as `SystemRepo.acceptedSystemSpecs.spec`. Inventory
   the affected existing namespace bindings, registered Repos and their durable
   objects. Distinguish a zero registration count from Cloudflare listing zero
   objects after pagination. For a populated Repo, distinguish zero domain rows
   from a compatible physical schema. Validate a retained spec with the
   candidate schema and identify any outstanding immutable facts that must
   survive. Link to [Studio inspection](../../../docs/content/guides/studio.md#inspect-a-cloud-instance) where applicable and
   [Cloudflare's read-only object listing](https://developers.cloudflare.com/api/resources/durable_objects/subresources/namespaces/subresources/objects/methods/list/).
   A failed, incomplete or unauthorized read leaves that scope unknown. Keep
   credentials and stored contents out of reports.
4. **Turn evidence into a scoped rollout decision.** On compatible storage,
   reuse the Worker, System identity and existing bindings. An affected
   namespace with no objects can provision on first use in place. If only a
   retained catalog is incompatible, scope the compatibility decision to
   SystemRepo and preserve accepted declaration provenance. If affected
   owner objects contain incompatible storage, establish a supported migration
   and verify retained history on representative state before rollout. If no
   supported path exists, report the blocker. Treat a different System ID,
   replacement namespaces, and destructive resets as separate operational
   choices, with explicit authorization where required. Keep browser Node
   compatibility independent. Successful build, healthcheck or spec acceptance
   alone cannot prove replay and canonical handoff.
5. **Make the rules available where agents enter the task.** In
   `zerospin-parallel-models`, put the stable owner Chain rule near the existing
   shared-history invariant. In `zerospin-evolve-declarations`, state the reuse
   default near step 1 and add the adopted-prefix proof to the existing
   declaration-evolution reference. Preserve the literal user-only registry
   rule. In `zerospin-consume-packages`, add the conditional deployment
   preflight before its verification step, with enough information to identify
   the live artifact and affected store and link to the Fragment guide. Keep
   policy in the skill bodies and the longer procedure in Fragment. Use links
   that resolve for a consumer of the packed SDK. Extend the existing skills
   and pages.

### Examples to include

1. **Authored V9 → V10 on compatible storage.** Keep the same owner Chain, add
   V10 as a candidate, and verify replay and durable publication. Show that the
   previous adopted prefix remains usable during promotion. Assess V9 retirement
   separately. The user handwrites any canonical change or release omission.
2. **Framework 39.0.0 → 43.1.1 with a catalog-only blocker.** In the dated QRK
   inspection, 20 namespaces other than SystemRepo listed zero objects. The one SystemRepo
   object held an accepted spec that the candidate rejected. The AggregateChain
   SQL difference therefore required no conversion of live AggregateChain
   objects in that inspection. Explain why the catalog still blocked the
   deployment and why this evidence did not justify replacing the Worker or
   clearing every namespace. Link to the historical research for exact versions
   and counts. Do not present the example as a shipped migration.

## Verification and completion

1. Walk both examples from the top of the handbook, deployment guide and
   relevant Intent skill. Confirm a reader can locate the evidence to keep or
   stop a rollout. Also walk a populated incompatible owner Chain case, where
   catalog compatibility alone is insufficient.
2. Check changed Markdown formatting and Fragment routes and anchors. Run
   `pnpm nx run fragment:build` and inspect the rendered reuse and preflight
   sections. Verify that the existing SDK packaging includes the changed
   skills and relative reference, and load them with the installed Intent
   tooling where available. Use existing checks and no new test files. This
   plan does not require a release or any production inspection.
3. Reconcile existing glossary entries for command chain and SystemSpec
   acceptance if their wording needs clarification after implementation.
   Keep ADR 025 active. Add an ADR only if an implemented decision meets the
   repository's criteria. Record verification and archive this plan with
   links repaired when all work is complete.

## Planned files

`+` creates a file. `~` modifies a file.

```text
zerospin/
├── fragment/content/
│   ├── guides/~ develop-and-deploy.md
│   └── handbook/
│       ├── ~ releases-and-systems.md
│       └── ~ versioning-and-deployment.md
├── packages/sdk/skills/
│   ├── zerospin-consume-packages/~ SKILL.md
│   ├── zerospin-evolve-declarations/
│   │   ├── ~ SKILL.md
│   │   └── references/~ declaration-evolution.md
│   └── zerospin-parallel-models/~ SKILL.md
└── wiki/archive/plans/+ 296-plan-owner-chain-reuse-and-storage-preflight.md
```

## Verification results

1. The handbook leads with owner Chain reuse, and the deployment guide links
   to the read-only preflight before staging a backend. Walked the V9 → V10
   authored upgrade, QRK catalog-only blocker, and populated incompatible
   owner Chain cases. Each case reaches a scoped decision.
2. The Fragment Nx build passed on its standard retry. The first invocation
   generated all 37 pages and then stopped at the installed Next.js security
   advisory. Verified the rendered reuse and preflight anchors and the links
   between the handbook, registry page, deployment guide, Studio, and browser
   storage reference.
3. Scoped formatting and the diff check passed. Packed the SDK into a
   temporary directory and loaded the three changed skills with the installed
   Intent loader. The declaration-evolution reference was included in the
   tarball. The handwritten-registry rule is byte-for-byte unchanged.
4. The existing command chain and SystemSpec acceptance glossary entries
   cover the terminology. ADR 025 still governs canonical handoff.
5. When publishing the docs, include the existing QRK research note so the
   case-study source link resolves from the deployed site.

## Remaining work

None.
