# Authored declaration board

**Date:** 2026-10-23. **Status:** Replaces the Reagraph design with a regular React board; source implemented; final verification assigned to the maintainer.

## Agreed design

Six columns show Aggregates, Services, Actors, Agents, Models, and Contracts.
Column headers contain declaration icons; cards contain names and version details.
Compact cards use a shadcn-style appearance through scoped CSS, without a
Tailwind requirement. Each card groups one logical declaration across releases;
Versions sort numerically. Cards show only authored declaration names and versions;
registration labels, release lists, computed counts, and invented agent version
badges are omitted. Registration context stays internal for filtering.
Same-name declarations under different registrations remain separate.

Selecting an aggregate or service filters the four declaration columns to its
explicit registrations across all releases. Both owner columns stay visible.
A second click or Clear filter restores all cards. The board fills the viewport and each column scrolls independently beneath
its fixed header. The board does not traverse
relationships, draw edges, or expose a relationship detail panel. Model versions provide a Fields button
opening a native modal dialog with their declared field metadata.

## Implementation boundary

`SystemDiagrams`, `ISystemDiagramsProps`, and the stylesheet export remain.
QRK's metadata-loading path is unchanged. The projection uses serialized
`ISystemSpec` metadata only. The complete initial board renders on the server;
React state provides client filtering. Reagraph, Drei, Three, their renderer
and layout code, and the graph font assets are removed. React peers remain
`>=19 <19.3`.

## Verification

Before the final icon relocation, package typecheck, lint, formatting, build,
and a frozen install passed. Inline checks covered numeric versions, repeated
names across owners, release reuse, agents, server rendering, and empty metadata.
Browser checks covered aggregate/service switching, toggling, Clear filter,
keyboard selection, empty metadata, responsive scrolling, sticky headers, and
light/dark appearance. The maintainer explicitly took over verification after
requesting header icons; final verification is theirs. No test files, fixtures,
or runners were added.

## Remaining work

The maintainer owns final verification, including the header-icon adjustment and removal of derived display values, scrolling/width adjustments, and model field dialogs.
The merge chat owns publication,
QRK's exact dependency pins and lockfile, and final consumer build verification,
as assigned by the maintainer on 2026-10-23.
