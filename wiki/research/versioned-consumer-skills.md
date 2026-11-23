# Versioned consumer skills

Primary-source research on 2026-10-13 against published `@tanstack/intent@0.5.5` and its [release source](https://github.com/TanStack/intent/tree/683c701dbdc0ee4985c0b09b44fe7c8cad9b7d10). Recommendation: ship guidance inside SDK releases and install a small consumer loader once; load the installed dependency's skill whenever its task applies. Shipping, discovery, and actual agent use are separate outcomes.

## Producer: include the complete skill

Before the approved distribution batch, the [SDK manifest](../../packages/sdk/package.json) had `files: ["dist", "src"]`, no repository/Intent metadata, and version `9.0.0`. `npm pack --dry-run --ignore-scripts --json` from `packages/sdk` reported 16 entries and **zero `skills/` paths**. It created no tarball and ran no lifecycle script. The minimum packaging change is:

```diff
- "files": ["dist", "src"],
+ "files": ["dist", "src", "skills"],
+ "repository": {
+   "type": "git",
+   "url": "git+https://github.com/morgs32/zerospin.git",
+   "directory": "packages/sdk"
+ },
```

The [npm files/repository contract](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/) covers packed directories and monorepo placement. Intent requires `skills/` plus derivable repository metadata; alternatively it accepts `intent.version: 1` with nonempty `intent.repo` and `intent.docs` strings. `tanstack-intent` is [recommended packaging metadata](https://github.com/TanStack/intent/blob/v0.5.5/docs/cli/intent-validate.md#packaging-warnings), **not a discovery requirement**. A private repository URL works because loading reads installed files, without fetching that repository. No JavaScript `exports` addition is needed. Sources: [registration](https://github.com/TanStack/intent/blob/v0.5.5/packages/intent/src/discovery/register.ts), [metadata parsing](https://github.com/TanStack/intent/blob/v0.5.5/packages/intent/src/discovery/scanner.ts).

After the normal build, repeat the [pack preview](https://docs.npmjs.com/cli/v11/commands/npm-pack/) and inspect `SKILL.md` **and every required reference**. Bundle indispensable guidance instead of requiring private GitHub access. Verify the actual release version against the skill's `metadata.library_version`; do not assume package versioning updates Markdown metadata. Publish through the normal release path only after those checks.

## Consumer: persist loading instructions

Once a skill-bearing SDK release is installed, pnpm workspace bootstrap:

```sh
pnpm add --save-dev --save-exact --workspace-root @tanstack/intent@0.5.5
pnpm exec intent install
pnpm exec intent list --json
pnpm exec intent load '@zerospin/sdk#zerospin-author-feature' --json
```

Enable the `@zerospin/sdk` package; that rule also includes future skills shipped in the package. Saving `"intent": { "skills": ["@zerospin/sdk"] }` in the root manifest before `install` supplies the permission policy without an interactive picker. `install` writes a persistent guidance block in an agent file, normally `AGENTS.md`; it copies no skills and installs no hooks. Subsequent loads read the installed package version, so ordinary dependency upgrades replace guidance alongside code. `--dry-run` writes nothing but still needs a terminal when permissions are absent. Sources: [install procedure](https://github.com/TanStack/intent/blob/v0.5.5/docs/cli/intent-install.md), [permission handling](https://github.com/TanStack/intent/blob/v0.5.5/packages/intent/src/commands/install/command.ts).

Published 0.5.5 generates installed runners such as `pnpm exec intent`; prose documentation claiming `@latest` runners is stale. Confirmed in its npm bundle and [runner source](https://github.com/TanStack/intent/blob/v0.5.5/packages/intent/src/shared/command-runner.ts). The [generated block](https://github.com/TanStack/intent/blob/v0.5.5/packages/intent/src/commands/install/guidance.ts) asks agents to list and load relevant skills before editing; it does not guarantee they comply.

Intent traverses workspace dependency graphs and pnpm links. Red Rope has SDK under `apps/zerospin/node_modules`, without a root SDK link. For multiple installed SDK versions, load from the consuming package and inspect JSON `version`, `packageRoot`, and `path`; root discovery alone does not establish that package's version. Sources: [dependency traversal](https://github.com/TanStack/intent/blob/v0.5.5/packages/intent/src/discovery/walk.ts), [load resolution](https://github.com/TanStack/intent/blob/v0.5.5/packages/intent/src/core/load-resolution.ts), [load contract](https://github.com/TanStack/intent/blob/v0.5.5/docs/cli/intent-load.md).

## Codex-only alternative

[Official OpenAI documentation](https://developers.openai.com/codex/skills/) lists `.agents/skills` discovery and supports symlinked folders; arbitrary `node_modules` skills are not a documented discovery location. Linking a skill there through a stable installed dependency path follows dependency updates. A missing root dependency link breaks a root-relative link; selecting a workspace dependency path binds that specific package. Avoid version-specific `.pnpm` paths. Copying creates an independently maintained snapshot. Discovery still does not prove activation or task success.

## Approved implementation status

The user subsequently approved SDK packaging, publication through Zerospin's existing local registry release path, and Red Rope as the first consumer. [Plan 148](../archive/plans/148-plan-consumer-skills.md) records the checks. All 19 fixed-group packages are published at `9.0.1` to local Verdaccio (`http://127.0.0.1:4873/`); independent queries confirmed their `latest` tags. The downloaded SDK tarball contains compiled public entrypoints, concrete `9.0.1` dependencies, and both Markdown files matching source byte for byte. Structural and pinned Intent `0.5.5 --check` validation passed, with only the intentionally absent producer development dependency warning. That initial publication used only the local registry and performed no Git operations.

Red Rope's root and `apps/zerospin` each list/load the SDK pilot at `9.0.1`, without warnings or conflicts. Installed Markdown matches source byte for byte, reference links resolve inside the installed SDK, and the managed agent block uses `pnpm exec intent` without a download fallback. Frozen installation, the three-project TypeScript graph, and executed web/admin builds passed against the final lockfile. Audits verified approved manifest changes, existing guidance, exact unrelated lockfile records, patch contents, and byte-identical contents for all 30 unowned dirty/untracked files. Generated build changes were restored. The authorized distribution batch is complete. Installed loading is proven; future agent activation and application feature behavior are separate outcomes.

## Complete skill-set release

The subsequent approved release is `9.0.2`, committed as `83fa67bd5ade1c9160662825b77f172165ae9e83` and published for all 19 fixed-group packages to the local registry. Downloaded SDK/browser/React tarballs contain five/one/one skills and byte-identical bundled references, with `9.0.2` frontmatter. Consumer policies allow all three owning packages; workspace consumers use the `workspace:` source prefix. Git commits remain local.
