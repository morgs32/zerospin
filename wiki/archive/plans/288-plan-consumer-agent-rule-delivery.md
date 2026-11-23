# Plan 288: Deliver strict Zerospin rules into consumer AGENTS.md

Status: complete. Implemented and verified on 2026-11-02.

## Problem and intended result

1. Intent advertises and loads skills, but the installed version does not copy arbitrary skill policy text into a consumer's AGENTS.md. A loader instruction alone leaves the strict registry rule dependent on agents choosing to load the relevant skill.
2. Ship a Zerospin-owned installer that puts the literal strict rule directly in AGENTS.md and a read-only check that detects missing or outdated content. Follow Nx's managed-block/check model; do not depend on Graft initialization, Brain propagation, or undocumented Intent behavior.
3. The governing rule remains: agents MUST NOT change existing canonical selections or omit previously registered Aggregate, Service, or owner releases. The user must personally handwrite those changes. Temporary changes, generated configuration, scripts, automation, and Studio actions are included. Passing checks and general upgrade requests do not grant permission.
4. Presence and freshness are the deliverable. Neither this installer nor CI can prove agent compliance or human authorship. Runtime promotion eligibility, persisted AVC markers, SystemSpec acceptance, and Studio release-retirement controls are separate work.

## Evidence and ownership

1. Source policy already exists in [the parallel-models skill](../../../packages/sdk/skills/zerospin-parallel-models/SKILL.md), under `Strict rule: user-only handwritten registry changes`. Preserve its wording and its direct visibility when Intent loads that skill.
2. [SDK packaging](../../../packages/sdk/package.json) already publishes skills but does not expose a policy asset subpath. [CLI packaging](../../../packages/cli/package.json) already owns the zerospin executable and has no direct SDK dependency. The proposed change adds that dependency and one asset export; it does not import the SDK runtime to configure instructions.
3. [CLI commands](../../../packages/cli/src/commands) use Pastel discovery, Zod options, Ink, and Effect procedures. Follow those conventions and the existing [procedure error/exit pattern](../../patterns/cli/procedure-step-error-exit-code-and-next-step.tsx).
4. Background research: [Nx, Graft, and Intent](../../../../mentormailbox/wiki/research/2026-11-02-agent-rule-delivery-nx-graft-intent.md). That sibling research link is local context, not a published dependency.

## Implemented command contract

1. `pnpm exec zerospin configure-agents-md` creates or refreshes only the Zerospin rule block in AGENTS.md in the current directory. It does not search parent directories or infer a workspace root.
2. `--directory <path>` explicitly selects another existing directory. No recursive installation or automatic directory creation.
3. `--dry-run` reports the target and exact proposed change without writing anything. `--check` performs the same comparison and exits nonzero for a missing, stale, malformed, or unreadable target. These flags are mutually exclusive. A matching target exits successfully in all modes.
4. The command requires neither zerospin.config.ts nor a running backend. It must not import consumer configuration, construct a System, load credentials, contact services, or inspect storage. No postinstall hook and no automatic invocation from dev, deploy, or Studio.
5. Managed destination markers are `<!-- zerospin:agent-rules:start -->` and `<!-- zerospin:agent-rules:end -->`. Their body contains a heading and the literal SDK policy fragment. Existing Intent, Nx, Graft, shared-pattern, and handwritten sections remain outside this block and untouched.
6. Existing target with no markers: append one block with the necessary newline separator. Missing AGENTS.md: create a document containing the block. Exactly one complete ordered pair: replace only that region when its canonical content differs. A matching region is a no-op, including file modification time.
7. Refuse incomplete, duplicate, reversed, or ambiguous occurrences of reserved markers. Refuse symlink and nonregular targets. Explain the problem and leave the file unchanged; never guess a repair or fall back to appending a second block.
8. Preserve all bytes outside the managed region, the existing LF/CRLF convention, and existing file permissions. Use a temporary sibling file and atomic replacement for updates; detect a changed target before replacing rather than knowingly overwriting intervening edits. Clean up temporary output on failure. Check and dry-run create no temporary files.
9. Compare canonical policy content with only the defined line-ending adaptation. Do not stamp the framework version into the block: a package version change alone must not create instruction drift.

## Source delivery decision

1. Keep the existing SDK skill as the only authored source of this rule. Add exact standalone source markers immediately around its existing heading and policy paragraphs, ending before the unrelated cross-model-read guidance. Intent still sees the full rule in the skill body.
2. Add an SDK `./agent-rules` asset export pointing to that published Markdown file. This is a raw asset for resolution and reading, not an executable API or a second policy file. Resolve it relative to the CLI package's direct SDK dependency and extract exactly one well-formed source region.
3. Missing dependency, unreadable asset, malformed markers, or an empty fragment is an error before any target write. Do not download a replacement or silently install an empty policy.
4. Add the SDK as a normal direct CLI dependency in the existing fixed release group. Use existing release machinery; do not invent a separate version, publish from dirty inputs, or alter a consumer's pins as part of the installer.
5. Alternatives rejected: duplicating policy strings in CLI and SDK creates two editing authorities; importing SDK runtime adds unnecessary startup work; reaching through unexported node_modules layouts is brittle; relying on Intent descriptions or Graft's best-effort Brain propagation does not guarantee literal delivery. The narrow asset export is the only new public package surface proposed here.

## Implementation sequence

1. Add source markers and the asset export without changing policy semantics. Confirm the published file selection includes the asset. Add the CLI dependency through the repository's normal package workflow, preserving unrelated lockfile changes.
2. Implement a feature-local procedure that resolves the source, validates both marker regions, computes the prospective document, and either checks, previews, or writes it. Keep the text comparison callable independently of the command UI; no generic registry, plugin layer, synchronization service, or background watcher.
3. Add the Pastel command and its three options using existing procedure output and error handling. Print the resolved target and created/updated/current status; show actionable errors and a failing process status through the existing error boundary.
4. Update the Fragment CLI reference, including its current blanket statement that the CLI loads consumer configuration: the new command is an explicit exception. Document options, markers, source ownership, exit behavior, and the limitation to instruction presence/freshness.
5. Update the existing add-to-existing-app guide and package-consumption skill with explicit installation and CI examples. Keep Intent discovery/loading instructions; the new block complements them. Explain that a future framework upgrade needs an explicit configure-agents-md refresh followed by --check.
6. Verify the built/published package boundary before any consumer adoption. In a separate implementation/adoption step, use the consumer's installed matching CLI and explicitly select its repository root. Commit only the intended managed block and any separately authorized CI wiring. This plan does not install a block into Mentor Mailbox or the framework repository.
7. Reconcile documentation with implemented behavior, then archive this plan when complete. Update an existing glossary only if actual new domain terminology warrants it; write an ADR only for an implemented, consequential tradeoff meeting the project's ADR criteria. Do neither during planning.

## Verification and acceptance

1. Follow existing CLI/SDK Nx build, type, lint, and formatting targets as applicable. Do not verify Explorer. No new committed test files, fixtures, test runner, or test configuration are authorized by this plan; the repository requires a separate explicit request for those.
2. Exercise the built command against disposable temporary directories, without adding a permanent test runner. Cover missing target, append, replacement, repeat no-op, LF/CRLF, preserved outside bytes and mode, malformed source/destination regions, symlink refusal, unreadable target, and write failure. Ensure failures leave original content intact.
3. For --check and --dry-run, compare directory inventories, target bytes, and modification times before/after to establish no writes. Confirm check exit status is success for current policy and failure for missing/stale/malformed policy. Confirm dry-run previews the exact change subsequently applied by normal mode.
4. Exercise from an empty temporary directory with no consumer config and no backend. Include a throwing config sentinel in a disposable case to show this command never imports it. No provider requests, live browser sessions, or application databases are needed.
5. Verify package manifests/tarball file lists and module resolution for the built CLI and SDK pair in an isolated installation using the existing package workflow. A source-checkout success alone does not establish consumer delivery. Do not start/publish to a registry or change pins without the applicable implementation scope.
6. Compare the installed block with the extracted source fragment. Change the disposable copy to simulate policy drift and verify failure. Confirm unchanged policy across a framework-version-only change remains current.
7. Confirm the final diff contains no canonical selection changes, release omissions, backend/storage changes, automatic hooks, or modifications to other vendors' managed blocks. The tool's operational write scope is the selected AGENTS.md and its transient sibling file only.
8. Report each seam separately: local build, disposable-file behavior, packaged delivery, and any explicitly authorized consumer adoption/CI wiring. Do not claim compliance enforcement or downstream installation from source changes alone.

## Planned file hierarchy

`+` new; `~` modified. Names below describe the intended minimal implementation; fit helper naming to existing CLI conventions without expanding scope.

```text
zerospin/
├── packages/
│   ├── sdk/
│   │   ├── package.json                                      ~ asset export
│   │   └── skills/
│   │       ├── zerospin-parallel-models/SKILL.md               ~ source markers
│   │       └── zerospin-consume-packages/SKILL.md              ~ install/check guidance
│   └── cli/
│       ├── package.json                                      ~ SDK dependency
│       └── src/
│           ├── commands/configure-agents-md.tsx                  + command UI/options
│           └── configureAgentsMd/configureAgentsMdFn.ts           + procedure/text handling
├── fragment/content/
│   ├── reference/cli.md                                       ~ command contract
│   └── guides/add-to-existing-app.md                          ~ adoption/CI examples
├── pnpm-lock.yaml                                            ~ dependency resolution
└── wiki/archive/plans/288-plan-consumer-agent-rule-delivery.md + completed plan
```

No consumer AGENTS.md or CI file is included in the framework implementation tree. Adoption targets must be named explicitly when that work is requested.

## Outcome and verification

1. Implemented `configure-agents-md.tsx` and `configureAgentsMdFn.ts` using the user-selected command/procedure names. SDK exports the marked source skill as `./agent-rules`; CLI has a direct SDK dependency and the lockfile contains only its added local link. Fragment and the package-consumption skill document installation, upgrade refreshes, and CI checking.
2. `NX_DAEMON=false pnpm nx run-many -t ts lint --projects=@zerospin/cli --outputStyle=static` passed, including CLI/SDK builds and required dependencies; lint reported zero warnings/errors. Nx Cloud reported a remote-cache authorization warning (401); local checks completed successfully. Changed supported files were formatted with the existing oxfmt tool. Explorer was not verified.
3. Disposable built-command checks passed for creation, explicit directories, replacement, current no-op timestamps, literal policy delivery, exact dry-run before/after preview, check/dry-run no writes, UTF-8 BOM and CRLF preservation, outside text and file-mode preservation, malformed markers, invalid UTF-8, symlinks, directories, FIFOs, unreadable files, invalid directories, mutually exclusive flags, and write failures. A throwing consumer config remained unimported. Process-local filesystem substitutions confirmed cleanup after replacement failure and preservation of an observed concurrent edit.
4. Packed CLI, SDK, and their local dependency closure using pnpm pack without publishing. Verified the CLI tarball includes the command/procedure and declares SDK 38.2.2, and the SDK tarball includes its source skill/export. Installed these tarballs into an isolated temporary consumer, exercised the actual zerospin executable, and verified exact policy equality, normal/check/dry-run exits, no consumer-config import, version-only no-op, and malformed/empty/missing source refusal without rewriting AGENTS.md. A subsequent offline frozen-lockfile install passed.
5. The isolated package check used temporary overrides for local framework tarballs and existing installed dependency versions. Initial unconstrained offline attempts hit missing cache metadata/tarballs and a baseline git dependency restriction; cached Drizzle/SQLite package tarballs and constraints derived from installed dependencies allowed the check to complete without downloads, policy bypasses, registry changes, or source dependency upgrades. This verifies packaged rule delivery against the installed dependency baseline; it is not a clean public-registry install or publication claim.
6. Existing unrelated source/documentation work was preserved. No application registry, canonical selection, registered release, runtime storage, consumer AGENTS.md, or CI configuration was changed. The framework implementation is complete; package publication and named consumer adoption remain separate scope.
7. No glossary or ADR update was warranted: this adds a CLI operation using existing terms, with no new runtime domain model. No committed tests, fixtures, or check runners were added.

## Remaining work

None.
