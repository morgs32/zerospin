# Session definitions and local sibling rollout

**Date:** 2026-10-18

**Status:** Complete on 2026-10-18. Framework and all five consumer migrations are committed, the local `15.0.0` rollout is complete, and all required permitted checks pass. The maintainer authorized both unrelated verification repairs; their fixes are committed and verified. Local commits and publication authorized; remote pushes, application runtimes, deployment, storage activation and data resets excluded.

## Agreed behavior and terminology

1. Use **Definition** for reusable ordinary session configuration. Rename the Aggregate, Service, standalone and browser constructors, ordinary session types, defining modules, import paths and application exports. Use `sessionDefinition` in execution, SharedWorker, Native, React, Devtools and Studio. Agent declarations retain their independently versioned **Agent release** names and use the common `sessionDefinition` property.
2. Normalize checked consumer `…SessionDeclaration` objects and files to `…SessionDefinition`. Name a colliding plain input `…SessionDefinitionProps`; introduce no wrapper, alias, overload or compatibility path.
3. Preserve behavior, identity, authorization, claims, contract/model selections, session locks, protocol discriminants, storage formats, domain versions, domain release constructors and resource-disposal methods. Update maintained guidance and shipped skills; retain historical research and archived documents.
4. Checkpoint all existing work in Zerospin, QRK, Red Rope Parking, Mentor Mailbox, Stackshirts and Zerospin Cloud before implementation. Prepare release artifacts from committed source and preserve consumer patches and unrelated dependencies.
5. Publish a new major through the existing fixed Nx release group to local Verdaccio, reusing registry storage. Keep Native private. Upgrade every existing direct Zerospin package pin, including `system-worker`, and each consumer lockfile with its pinned package manager.
6. Refresh only Cloud's reference subtree through the vendor workflow from the committed local source snapshot, with clean source and consumer worktrees. Do not edit framework files in the consumer subtree.

## Planned files

`+` creates a file; `~` modifies or renames an existing file. Patterns denote the directly affected modules, imports and configuration consumers.

```text
zerospin/
  ~ packages/core/src/{sessionDefinition,aggregateSession,serviceSession,sessionExecution}/**
  ~ packages/{browser,react,native,devtools,studio,sdk}/**
  ~ examples/{shopping,tic-tac-toe,external-work}/**
  ~ fragment/content/**
  ~ README.md
  ~ wiki/{glossary.md,patterns/**,architecture/**}
  + wiki/plans/242-plan-session-definitions-and-sibling-rollout.md
  ~ packages/*/package.json and pnpm-lock.yaml
../{qrk.sh,redropeparking,mentormailbox,stackshirts,zerospin-cloud}/
  ~ first-party session definitions, browser wiring, worker registrations and maintained guidance
  ~ direct dependency manifests and package-manager lockfiles
../zerospin-cloud/
  ~ vendor/zerospin (subtree pull only)
```

## Implementation sequence

1. Record baseline commits and all current package versions; inspect existing source and consumer APIs.
2. Complete the framework terminology cutover and current documentation, preserving ongoing refactors. Verify declarations/imports and configuration-versus-protocol boundaries.
3. Run existing scoped declaration builds, typechecks, lint and formatting for affected packages/examples, including Native. Never verify Explorer. Add no test files, fixtures, runners or configuration.
4. Commit the verified framework snapshot, apply the fixed major release with the existing Nx workflow and publish locally from clean committed source. Inspect published declarations and obsolete-export removal.
5. Upgrade exact pins and lockfiles and finish consumer adaptations. Run QRK Studio and Library Storybook; affected Parking applications; Mentor student/mentor applications; Stackshirts storefront; Cloud API/UI libraries and control-plane applications.
6. Pull the committed source into Cloud's reference subtree. Reconcile glossary/patterns and classify intentional Agent/domain release and lifecycle references. Record per-repository versions, results and blockers; archive only after complete permitted verification and rollout.

## Baseline checkpoints

| Repository       | Commit                                     |
| ---------------- | ------------------------------------------ |
| Zerospin         | `70f329378f9ddf7276a21a0a6efec4111b6fa616` |
| QRK              | `da7670a17390fbf8c299b66f74a8e9f4913c89a3` |
| Red Rope Parking | `00969fda39bda6090b69c25733d9be43f2070071` |
| Mentor Mailbox   | `4816419eeac4043fd10193262f1eae805da70a19` |
| Stackshirts      | `35b70a0dd662ee779f5bc42590909c0e4dde8d73` |
| Zerospin Cloud   | `20fa6b36016a934844833987d31c77c1f6463fbd` |

## Framework verification

1. All 19 packages in the fixed release group were published at `15.0.0` to the existing Verdaccio storage at `http://127.0.0.1:4873/` from clean committed source `4a2578a08621985410dacbc6c2fc288f4300e009`; private Native remains `0.1.0` and unpublished. Registry metadata confirms every exact version. The published Core, Browser, SDK and React tarballs contain 511 declarations with no obsolete ordinary session interfaces or import paths. The existing release script updated the package manifests without unrelated lockfile dependency changes.
2. All 58 existing `lib`, `ts` and `lint` tasks passed for the 19-package fixed group, Native and the Shopping/tic-tac-toe examples (21 selected projects and one dependency). Lint retained existing warnings; no lint errors occurred. Scoped Oxfmt validation passed for 170 changed files, and `git diff --check` passed.
3. Rebuilt declarations and JavaScript contain no superseded ordinary SessionRelease/BrowserRelease types, constructors, `sessionRelease` property or executionRelease import paths. Remaining Release declarations are domain releases, independently versioned Agent releases or disposal. Independent review confirmed unchanged lock factories, claims, identity and storage inputs; nonconfiguration string literals in changed TypeScript files also match the checkpoint.
4. The initial `zerospin:test-external-types` run reported four pre-existing fixture errors: obsolete Game insert fields, obsolete purchase insert shape, missing quote `subtotal` and missing payment result `total`. After maintainer approval, `computer-move.node.spec.ts` no longer seeds or expects derived turn/game outcome fields; `purchase-quote.node.spec.ts` seeds the current purchase identity/promotion fields, records subtotal/discount/total, and returns payment evidence with its total. Both `zerospin:test-external-types` and `zerospin:test-external-examples` now pass; all six existing runtime examples pass. Scoped Oxfmt, Oxlint with zero warnings, and whitespace checks pass. Fix commit: `62620ee18331957200c03c6cf9dccc43d6dd7177`. No production declaration or new test/check infrastructure was introduced.

## Consumer rollout and verification

All existing direct package pins, including `system-worker` and applicable peer pins, are exactly `15.0.0`. Installed versions and frozen lockfile installations were checked with each consumer's pinned pnpm. Unrelated dependency selections were restored where the package manager attempted to change them.

| Repository       | Direct pins | Migration commit                           | Existing checks and blockers                                                                                                                                                                                                                                                                       |
| ---------------- | ----------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QRK              | 28          | `d2c5b1287f47434d18dd76b156dcc453efaa8822` | Studio production build and Library Storybook build pass; scoped formatting and whitespace pass. No blocker.                                                                                                                                                                                       |
| Red Rope Parking | 22          | `8b1226a99a6d00e029394da0021cec7f61f932cb` | Web and admin production builds and web Storybook build pass; scoped formatting and whitespace pass. No blocker.                                                                                                                                                                                   |
| Mentor Mailbox   | 16          | `fedf4d19e1b085945b179950d6519a6e7695a915` | Mentor and student production builds pass, including TypeScript. The approved student story repair guards its first episode before supplying the required argument; fix commit `b3c3c7d19bb25400092a0cd44857e0909beba186`. Scoped formatting, whitespace and frozen installation pass. No blocker. |
| Stackshirts      | 9           | `de4a083c61a1a1a292772b7826deca052fc77dc3` | Storefront production build, whitespace and frozen installation pass. Existing Sass deprecation warnings remain. No blocker.                                                                                                                                                                       |
| Zerospin Cloud   | 23          | `19593358397d9331ef7797d47efa66e7ceeede4b` | Fresh API/UI declaration builds and admin/cloud production builds pass, with zero cache hits. Existing application build configuration skips TypeScript validation; API/UI builds check declarations. Scoped formatting and whitespace pass. No blocker.                                           |

1. QRK's checked user session now owns the `userSessionDefinition` name; the colliding plain backend configuration is `userSessionDefinitionProps`, including defining filenames. Ordinary constructor, browser-export, worker-registration, mock and server-side payment-lock callers use the current Definition API throughout the consumers.
2. Older 13.x consumers also received the existing framework codec changes: Parking Metro payload codecs and Stackshirts payment decoding now refer to `resourceJsonCodec` instead of removed `resourceSchema`. Remove obsolete plain Aggregate configuration `kind` fields where the current constructor no longer accepts or retains them; actual protocol discriminants remain unchanged. Domain identifiers, versions, claims, lock construction and contract/model selections retain their responsibilities and values.
3. Parking's original `system-worker@13.0.0` patch file is preserved byte-for-byte. Its obsolete registration was removed: current QuerySelection encodes selected rows with the row codec and readSelectedResources decodes that representation before validating the portable resource type, already providing the Date behavior the old patch repaired. No replacement consumer patch or compatibility path was introduced. Other consumer patches and patch metadata remain unchanged.
4. Cloud's reference subtree was pulled from clean committed source `4a2578a08621985410dacbc6c2fc288f4300e009` through `git subtree pull --prefix=vendor/zerospin ../zerospin main --squash`. Merge `cca349f996bacf36aa92baee40976353c22c289d` and squash `887d8dcf71a7c44a0539b43c9e2317bd009150f5` produced the exact source tree `5fc2a390ab957ba6fdf5f7da039e54bd2d034b98`. No vendored source was hand-edited. Later producer plan-status documentation is outside that recorded framework snapshot.
5. Current first-party source, maintained guidance and shipped skills use Definition for ordinary reusable configuration. Remaining Release references describe independently versioned Agent declarations (including Shopping's `purchasesSessionRelease`), domain releases, published packages, disposal or preserved historical records. No compatibility aliases, fallback readers, translation migrations or new tests/check infrastructure were added.
6. All six repositories were checkpointed before implementation. Implementation and consumer migration commits are local. No remote pushes, deployments, application runtimes, storage activation or data resets occurred. Older consumers receive earlier framework cutovers through this package upgrade; runtime activation is outside this plan.

## Verification closure

1. On 2026-10-18 the maintainer authorized repairing both remaining blockers, rerunning their checks, committing the fixes and archiving this plan after success. The two existing external-work fixture files and one existing Mentor story were repaired without changing production behavior or adding files, fixtures, runners or configuration.
2. `NX_NO_CLOUD=true pnpm nx run-many -t test-external-types,test-external-examples -p zerospin --parallel=2` passes both checks and all six runtime examples; its six library dependencies reuse matching cached outputs. Scoped Oxfmt, Oxlint with `--deny-warnings`, and `git diff --check` pass. Commit `62620ee18331957200c03c6cf9dccc43d6dd7177` contains only the two fixture repairs.
3. In Mentor, `pnpm exec turbo run build --filter=app` passes the student production build and TypeScript, with one of one tasks successful. Scoped Prettier and whitespace checks pass. Commit `b3c3c7d19bb25400092a0cd44857e0909beba186` contains only the story guard. Existing lockfile-parser/hook notices are nonblocking; the worktree is clean.
4. The previous package/Native/example and consumer checks remain recorded above. No remaining required behavior or permitted verification is deferred. Cloud retains its exact recorded source snapshot; these fixture/story repairs and plan archival require no package republication, vendor refresh, runtime activation, deployment or storage change.

## Remaining work

None.
