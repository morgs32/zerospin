# TanStack Intent discovery and skill planning

Primary-source research on 2026-10-13 against `@tanstack/intent@0.5.5`, Git revision `683c701dbdc0ee4985c0b09b44fe7c8cad9b7d10`. The npm registry query below confirmed the published version; the [release manifest](https://github.com/TanStack/intent/blob/683c701dbdc0ee4985c0b09b44fe7c8cad9b7d10/packages/intent/package.json) identifies the inspected package.

## What generates the guidance

Historical `scaffold` printed a hardcoded orchestration prompt with three interpolated meta-skill paths. It neither inspected library documentation nor generated files; the coding agent followed those instructions. Intent 0.5 replaced it with the maintainer workflow. Sources: [v0.4.0 implementation](https://github.com/TanStack/intent/blob/v0.4.0/packages/intent/src/commands/scaffold.ts), [official release announcement](https://tanstack.com/blog/intent-0.5-skills-you-can-maintain).

Current `maintainer setup` registers existing skills, creates missing planning skeletons, installs repository instructions, and copies missing CI configuration. `meta <name>` prints one procedure and rewrites package-relative links; referenced procedures remain separate. Existing coding agents perform research and authoring. Sources: [maintainer commands](https://github.com/TanStack/intent/blob/v0.5.5/docs/cli/intent-maintainer.md), [meta command](https://github.com/TanStack/intent/blob/v0.5.5/docs/cli/intent-meta.md), [authoring procedure](https://github.com/TanStack/intent/blob/v0.5.5/packages/intent/meta/generate-skill/SKILL.md).

## Sandbox inspection

These commands ran from `/tmp` and exited successfully:

```sh
npm view @tanstack/intent version dist.tarball repository.url engines --json
npx --yes @tanstack/intent@0.5.5 --help
npx --yes @tanstack/intent@0.5.5 maintainer --help
npx --yes @tanstack/intent@0.5.5 meta --help
npx --yes @tanstack/intent@0.5.5 meta
npx --yes @tanstack/intent@0.5.5 meta domain-discovery
npx --yes @tanstack/intent@0.5.5 meta tree-generator
npx --yes @tanstack/intent@0.5.5 meta generate-skill
```

The package was installed into npm's external execution cache. No setup, registration, validation, skill generation, or fresh consumer evaluation ran.

Complete extraction requires the [discovery procedure](https://github.com/TanStack/intent/blob/v0.5.5/packages/intent/meta/domain-discovery/SKILL.md), its [deep-read instructions](https://github.com/TanStack/intent/blob/v0.5.5/packages/intent/meta/domain-discovery/references/deep-read.md) and [artifact formats](https://github.com/TanStack/intent/blob/v0.5.5/packages/intent/meta/domain-discovery/references/artifacts.md), the [tree procedure](https://github.com/TanStack/intent/blob/v0.5.5/packages/intent/meta/tree-generator/SKILL.md) and [writing templates](https://github.com/TanStack/intent/blob/v0.5.5/packages/intent/meta/tree-generator/references/write-skills.md), plus shared authoring rules and [initial-batch guidance](https://github.com/TanStack/intent/blob/v0.5.5/packages/intent/meta/generate-skill/references/initial-batches.md).

## Validation limits and Zerospin adaptation

`validate` checks frontmatter, length, artifacts, relative links, and fenced JavaScript/TypeScript against library source or declarations. Compiler checks require usable TypeScript and a library entry; unavailable checks are reported as skipped. Partial examples tolerate omitted names and external modules. Examples are not executed, components are not rendered, and structural/type checks do not establish runtime correctness or skill discovery. Sources: [validation reference](https://github.com/TanStack/intent/blob/v0.5.5/docs/cli/intent-validate.md), [task-quality procedure](https://github.com/TanStack/intent/blob/v0.5.5/packages/intent/meta/generate-skill/references/task-quality.md).

The approved [Zerospin prompt](../skills.md) adapts discovery and tree design for library consumers. Tasks and consequential decisions determine boundaries; exports, current examples, and repository guidance supply evidence. It proposes a minimal flat tree and stops before writing `SKILL.md`. It retains source-backed failure constraints and genuine prerequisites without interview rounds, skill/mistake quotas, mandatory overviews, full Intent planning artifacts, or setup. This deliberately adapts upstream discovery's interview protocol while following its [task-focused tree guidance](https://github.com/TanStack/intent/blob/v0.5.5/packages/intent/meta/tree-generator/SKILL.md). Later verification should reuse existing repository checks and distinguish compiler, runtime, and consumer-session evidence.
