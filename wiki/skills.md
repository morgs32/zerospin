# Design Zerospin consumer skills

Copy this prompt into an agent chat with the Zerospin repository available. It
adapts TanStack Intent's discovery and tree-design guidance for consumer tasks,
returning a proposal before any skill files are authored.

```text
Discover the smallest useful set of concise skills for agents building
applications with Zerospin. Produce a domain map and proposed skill tree
in this conversation. Stop before writing skills or changing repository
files.

Audience and API boundary
- Consumer guidance covers @zerospin/sdk and @zerospin/sdk/browser for
  authoring, plus supported @zerospin/browser and @zerospin/react APIs
  for application integration.
- Read internal implementations to establish behavior. Consumer examples
  must use supported public entrypoints.
- Follow repository instructions while investigating. Include repository
  conventions in consumer guidance only when they apply to application
  authors.

Discover the work
1. Record the current revision, relevant package versions, and whether
   evidence includes uncommitted changes.
2. Inspect public exports, types, peer dependencies, current guides,
   working examples, and relevant existing checks. Follow source only
   as far as needed to resolve task behavior. Use wiki/patterns/index.md
   to locate relevant conventions.
3. Identify what developers actually need to accomplish, the decisions
   they must make, required ordering, and observable completion.
4. Verify task-relevant ownership, release identity, authentication,
   selection and command authority, transaction boundaries, staging
   versus execution, external-work continuation, and session lifetime.
   Include these only where they affect the task.
5. Keep source/docs contradictions visible. Source establishes implemented
   behavior; current examples and checks establish supported usage.
   Distinguish current behavior from proposals and archived designs.
6. Ask only consequential intent questions that remain after exploration.
   Reuse settled decisions. Do not impose interview rounds or quotas.

Design the tree
- Group features used together in one developer task. Split a skill only
  when its task deserves independent discovery.
- Prefer a flat structure. Add a router only if it resolves a real choice
  that activation descriptions cannot.
- Assign each skill one owning public package. SDK/browser belongs to
  packages/sdk. Cross-package workflows have one owner and list all
  supported imports they need.
- Give shared guidance one authoritative home. Add prerequisites only
  when another skill genuinely must be read first.
- Use references for substantial conditional detail, with explicit
  reading conditions.
- Aim for eventual skill bodies around 250 words or less, excluding
  frontmatter and references. Retain necessary steps and failure handling.
- Omit API catalogues, generic TypeScript/Effect lessons, duplicated
  rules, speculative mistakes, and unsupported compatibility paths.

Return
1. A brief revision, scope, and evidence-gap note.
2. A compact domain/task table.
3. Proposed tree YAML. Each entry contains:
   slug, domain, package, path, description, purpose, imports, sources,
   completion, and an existing verification route or explicit gap.
   Add sourced mistakes/corrections, requires, and reference_candidates
   only when justified.
   Package paths are repository-relative; skill paths are relative to
   their owning package. Eventual frontmatter name equals slug.
4. A short explanation of consequential merges, exclusions, and unresolved
   decisions.

This is a discovery proposal, not an Intent registration artifact.
```

## Validate the shipped skills

After building the workspace libraries, run `pnpm skills:check` from the
repository root. This runs the pinned Intent checker from each owning package
(SDK, Browser, and React) so TypeScript examples can resolve that package's
dependencies. Required CI runs the same command after the build.

## Sources

Adapted from TanStack Intent **0.5.5**:

- [Domain discovery](https://github.com/TanStack/intent/blob/v0.5.5/packages/intent/meta/domain-discovery/SKILL.md)
- [Skill tree design](https://github.com/TanStack/intent/blob/v0.5.5/packages/intent/meta/tree-generator/SKILL.md)
- [Shared authoring rules](https://github.com/TanStack/intent/blob/v0.5.5/packages/intent/meta/generate-skill/SKILL.md)

See [TanStack Intent research](research/tanstack-intent.md) for the CLI findings,
linked reference procedures, and validation limits.
