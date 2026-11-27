# Zerospin DevTools

A mounted shell owns its validated preferences, console-open completion, keyboard
listener, active drag and detached popup. Console opening resolves after a visible
layout commit; closing before that commit or unmounting rejects the pending open.
Stored preferences are decoded exactly, blocked storage falls back to defaults,
and an explicit host theme remains fixed for that mounted lifetime.

A new drag replaces the previous one. Mouseup, popup closure and unmount remove
its native listeners. Heights stay finite and fit the current viewport; closing
below the drag threshold preserves the last usable reopen height. The popup owns
its copied styles, theme and pagehide/host-unload cleanup. One MemoryRouter retains
routes while the panel is closed and resets to Sessions on shell remount.

Session logs build one pure graph from retained telemetry. Exact-trace parent
lookup, stable invocation ordering and one timing axis drive the waterfall.
Missing, cross-trace, ambiguous and cyclic relationships remain visible as
detached spans and graph diagnostics. Exact duplicates coalesce; conflicting
records remain visible. Server links stay external and missing-span records stay
Unattached. Session stores remain the original clearable capture owners.

## Preview the panel in Storybook

Run `pnpm nx run @zerospin/devtools-storybook:storybook` and open
[Devtools Storybook](https://devtools.zerospin.localhost). The **Devtools / Populated Database**
story opens a standalone Aggregate session and displays its list items. Use the
Storybook theme control to compare the same rows in light and dark. Open Commands
to inspect the commands that produced them.
