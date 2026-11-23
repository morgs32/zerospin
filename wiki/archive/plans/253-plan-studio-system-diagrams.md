# Studio authored-system diagrams

## Agreed behavior

1. Add a separate `/diagram` page linked from Admin, with Structure and Command relationships views selected through `?view=structure` or `?view=commands`. Default to Structure.
2. Show the whole authored System and every registered version, fully expanded. Permit canvas pan, zoom and fit only. No selection behavior, collapsing, node dragging, editing or details panels.
3. Adapt Explorer's nested cards, background and labeled edges locally in Studio. Leave Explorer untouched. Use Studio's existing `studioSystemSpec`; add no core metadata or API changes.
4. Structure groups models, contracts, actors and agents by their aggregate or service release and shows contract exposure and model selections. Names, versions and relationship labels are sufficient; omit field/schema details.
5. Command relationships shows declared model operations, external operations, cross-owner commands and agent behaviors. Distinguish public and server operations when different. Edges mean declared possibilities, never program order, branches or observed execution.
6. Resolve exact declaration identities in owner context. Unregistered references remain labeled reference cards. Never infer destinations inside opaque external requests.

## Decisions and rationale

1. Keep Admin as the landing page and link a separate Diagram page, preserving existing inspection routes.
2. Keep both graphs expanded and view-only to minimize interaction and state. Reuse rendering pieces without introducing a shared package or dependency on Explorer.
3. Use deterministic kind/name/numeric-version sorting and rows/columns sized from contents, with identities scoped by owner family/name/version and declaration identity.
4. Change no storage and create no test files, fixtures, runners or configuration. Preserve unrelated working changes.

## Implementation

1. Add Studio's `@xyflow/react` dependency at `12.12.0` and update the lockfile.
2. Build pure Structure and Command relationships projections from `ISystemSpec`, including nested layouts, labeled edges and unresolved reference cards.
3. Wire the Diagram route, Admin link, view buttons, canvas and viewport controls. Fit on initial render and view changes; handle an empty graph.
4. Verify through existing Studio checks and browser inspection using Shopping authored metadata. Check version/owner identity, exact edges, direct routes, view switches, long labels, empty graphs, pan/zoom/fit and inert clicks. Do not verify Explorer.
5. Reconcile implemented terminology with the existing glossary after implementation. Create an ADR only for a hard-to-reverse, surprising decision involving a real trade-off. No new ADR is anticipated for this local UI addition.
6. Record verification evidence, set Remaining work to None and archive this plan after all required work finishes.

## Planned hierarchy

`+` creates; `~` modifies.

```text
zerospin/
├── packages/studio/
│   ├── package.json                         ~
│   ├── project.json                         ~
│   └── src/
│       ├── main.tsx                         ~
│       ├── StudioHome.tsx                   ~
│       └── diagram/
│           ├── SystemDiagram.tsx            +
│           ├── makeSystemDiagram.ts         +
│           ├── DiagramNode.tsx              +
│           └── diagram.css                  +
├── pnpm-lock.yaml                           ~
├── wiki/glossary.md                         ~
└── wiki/plans/
    └── 253-plan-studio-system-diagrams.md    +
```

## Implementation and verification

1. Implemented both routes/views, deterministic owner-scoped graphs, nested cards, inert declarations and viewport controls. Grouped relationships sharing endpoints into multiline labels and routed same-column relationships outside declaration cards.
2. Loaded Shopping's actual authored System through the repository's SWC TypeScript loader and projected it with `makeSystemSpec`. Structure renders 34 nodes/18 edges; Command relationships renders 34 nodes/43 edges. This verifies authored metadata/UI, not authenticated runtime operations.
3. Inline checks passed for graph identity, deterministic output, parent containment, public/server operation labels, cross-owner commands, numeric release ordering, missing references, long labels and empty graphs. Created no test files, fixtures, runners or configuration.
4. Chrome verification passed for direct Diagram loading, default Structure selection, both view buttons, empty graphs, full declaration rendering, text containment, inert node clicks, zoom, canvas pan, fit and Admin/Diagram navigation. Existing backend-dependent Admin controls were not exercised; the preview serves authored metadata without a connected backend.
5. Reconciled the glossary's System definition with declared relationships and their distinction from executed commands. No ADR warranted: this is a reversible local UI addition without a qualifying architecture trade-off.
6. Formatted Studio's existing project configuration to clear its pre-existing formatter failure; no configuration behavior changed. Preserved unrelated edits. Explorer was neither edited nor verified.
7. `pnpm nx run-many --targets=ts,lint,format:check --projects=@zerospin/studio --outputStyle=static` passed, including 13 dependency tasks. Invoked with `pnpm_config_verify_deps_before_run=warn` to prevent pnpm's unrelated automatic install behavior. Lint reports one pre-existing curly-brace warning in `fetchStudioJson.ts:35`; diagram code adds no warnings. Nx Cloud DNS/cache upload was unavailable, without failing local checks. Scoped formatting and `git diff --check` passed.

## Outcome

1. Completed and verified on 2026-10-21. No authenticated backend, command execution or persistent storage verification is claimed by this authored-metadata UI change.

## Remaining work

None.
