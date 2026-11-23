# Give mounted DevTools resources explicit owners

Status: Implemented and verified in the approved goal on 2026-10-11.

The [DevTools shell](../../../packages/devtools/src/ZerospinDevtools.tsx) combines routes, navigation, persistence, imperative opening, hotkeys, resizing, a popup and rendering. Its mousemove/mouseup listeners are removed only by mouseup, so unmount or a second drag can leave an earlier operation alive. [Persisted preferences](../../../packages/devtools/src/store.ts) are accepted through an unchecked generic JSON cast. Hotkey matching computes every modifier permutation even though membership matching ignores order. The Profiler route is a stub: the store initializes profiles to[] and no authored caller records/adds a profile. The useful design is one mounted shell with scoped interaction owners and only working navigation.

1. `readDevtoolsPreferences` validates stored settings/state through an exact schema before combining them with existing defaults and the lifetime-fixed host config. Preserve current merge precedence: stored preferences win ordinary host settings, and an explicit host theme wins stored theme. Invalid or inaccessible localStorage falls back to defaults through the one read boundary; getItem itself must be protected, not just window.localStorage access. No legacy preference translator or unchecked tryParseJson<T> remains. Keep persistence for valid current fields; invalid obsolete storage is discarded under the hard-cut policy.
2. `useDevtoolsVisibility` owns attached visibility and the pending imperative-open completion. Keep the existing global controller's coalescing Promise and identity-checked loader/shell unregister; do not invent a second controller. An open resolves after a visible layout commit, including detached visibility. Unmount rejects a pending open. If close cancels an open before visibility commits, settle that pending request explicitly with the existing local Error style rather than leaving it pending indefinitely. Same-turn close/reopen of an already visible panel remains successful. Preserve route memory while closed and reset it on shell remount.
3. `useDevtoolsPanelResize` owns at most one drag and its ownerWindow listeners. Starting a new drag disposes the old one; mouseup, popup closure and unmount dispose it as well. Preserve top/bottom direction and the current below70pixel close threshold. Persist a finite usable height rather than negative/NaN/unbounded dimensions: when crossing the close threshold, close while keeping the last valid reopen height. Clamp visible height against the current owner window's available viewport. Resizing must not update an unmounted component.
4. `useDetachedDevtoolsWindow` owns popup acquisition, copied stylesheet fallback, pagehide listener and closure. Keep moving the same routed tree between attached and detached portals, preserve the established router lifetime and propagate the existing popup-blocked Error. Synchronize the DevTools theme attribute on the actual popup document as well as the host document. Close/deregister exactly once on host unload or unmount; stale pagehide callbacks must not clear a replacement popup. Do not add a second route/session tree or a popup polling loop.
5. Keep the configured hotkey semantics, editable-control exclusion and Escape close order. Compare normalized uppercase key membership directly, expand CtrlOrMeta to the existing two alternatives and require no extra pressed keys. Delete factorial permutations rather than renaming them. Scope the current key listener through mounted ownership; adding unrelated shortcuts or detached-window keyboard behavior is outside this plan.
6. Extract actual navigation/routes from the shell without wrapping every short render operation. Delete the unused Profiler tab, route, five source files, IProfilerProfile type and profiles state field. Exhaustive current source search finds no recorder, no addProfile operation and no route producer beyond those files. Preserve session/state/commands/database/logs/settings navigation, current data-testid hooks and existing fixture/story assets. The route wildcard continues to go to Sessions; no compatibility Profiler redirect or fake recording feature is retained.

The parent becomes a short ordered React owner composition, without making hooks run inside Effect generators:

```tsx
export function ZerospinDevtools({ config }: DevtoolsProps = {}) {
  const preferences = useDevtoolsPreferences(config);
  const visibility = useDevtoolsVisibility(preferences);
  const detached = useDetachedDevtoolsWindow(preferences.settings.theme);
  const resize = useDevtoolsPanelResize(preferences, visibility, detached);
  useDevtoolsKeyboard(preferences.settings.openHotkey, visibility);
  if (!preferences.mounted) return null;
  return (
    <DevtoolsFrame
      preferences={preferences}
      visibility={visibility}
      detached={detached}
      resize={resize}
    />
  );
}
```

The one MemoryRouter stays in the mounted shell/frame position required by current routing. Hook return values are narrow domain interfaces, not a spread bag of every state setter. Native acquire/release is synchronous browser work in committed effects/event handlers; no SQL transaction or new session authority is involved. Cleanup errors must not silently leave listeners/closed windows owned by a stale shell. Preference hydration and all controller registrations are SSR-safe and idempotent through StrictMode effect setup/cleanup. The refactor removes unchecked persistence, permutation work and dead Profiler machinery, rather than simply dividing the current file into equally large fragments.

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
  packages/devtools/src/
    ~ ZerospinDevtools.tsx
    + shell/DevtoolsFrame.tsx
    + shell/DevtoolsNavigation.tsx
    + shell/DevtoolsRoutes.tsx
    + shell/useDevtoolsPreferences.ts
    + shell/useDevtoolsVisibility.ts
    + shell/useDevtoolsPanelResize.ts
    + shell/useDetachedDevtoolsWindow.ts
    + shell/useDevtoolsKeyboard.ts
    ~ store.ts
    ~ types.ts
    ~ zerospinDevtoolsStore.ts
    ~ zerospinDevtoolsController.ts # preserve coalescing and identity cleanup; integrate cancellation only
    ~ utils/hotkey.ts
    ~ utils/storage.ts
    ~ utils/sanitize.ts # remove unchecked JSON/permutations; retain used uppercase helper
    - profiler/ProfilerLayout.tsx
    - profiler/ProfilerDetailEmpty.tsx
    - profiler/profileId/ProfilePane.tsx
    - profiler/profileId/ProfilePropsTab.tsx
    - profiler/profileId/useProfileForRoute.ts
```

Affected entrypoints are browser loadDevtools and the global console open operation. Session stores and their generic-erased service inspector callbacks retain their real typed-session closure ownership. SettingsRoute continues using the same preference store; if validation exposes an invalid edit, reject it at that update boundary rather than passing an invalid hotkey to the shell. Current host config stays fixed for a mounted lifetime. Popup/window refs that native callbacks need may remain; do not remove a meaningful committed-state/native-state distinction solely to reduce refs.

Implementation order: introduce validated preference read/write; define visibility completion transitions; introduce cleanup-owned resize and popup hooks; replace permutations; extract actual routes/frame; remove Profiler state/module/imports; adapt browser loader integration; then verify existing gates and native UI flows. Intentional changes are invalid preference rejection, canceled opens settling, drag cleanup and removing a feature with no recording path.

Verification: `pnpm nx run-many -p @zerospin/devtools,browser -t lib,ts,lint`. Existing Studio/application DevTools can exercise mounted console opening, close/reopen, detached portal, drag/unmount, invalid storage and theme settings. Preserve existing supporting UI fixtures, but the current Studio stories directory is absent; do not claim an existing story verifies this. No new test/story/fixture/runner/config is authorized. Runtime cases remain unrun; source gates do not establish layout-commit or native listener timing. Shopping application browser verification is prohibited by its AGENTS, so use permitted Studio or other actual host UI seams.

Postimplementation: update mounted DevTools lifecycle docs and remove Profiler references. No new glossary or ADR is required for component extraction; a changed public console-open cancellation promise may justify documenting that lifetime decision. Archive after browser-loader integration, dead references and required checks settle.

## Implementation progress — 2026-10-11

The approved ownership cutover is implemented in production source and its direct
consumers. Root coordination owns required Nx gates and plan archival.

DevTools `lib`, `ts` and `lint` passed in `/tmp/zerospin-goal-quality-8.log`. Scoped shell/trace lint passed with zero warnings. Package/module README changes are written. Mounted popup, resize and blocked-storage behavior is verified in the authorized controlled checks below.

### Authorized mounted ownership checks — 2026-10-11

The human authorized disposable `/tmp` fixtures. The actual production `ZerospinDevtools` shell, controller, routes and hooks were mounted using installed ReactDOM19 and Happy DOM. Malformed preferences and inaccessible localStorage fell back safely. Imperative opening resolved after visible commit; concurrent lazy opens shared one completion, loader disposal rejected its waiter, unmount rejected an opening before visibility, and same-turn close/reopen succeeded. Configured Ctrl+k, editable-input exclusion and Escape order passed. Settings routing survived close/reopen and popup movement and reset on shell remount.

Owned popup close/reopen, pagehide, host unmount and stale pagehide callback cases passed with exact closure/listener identities. Blocked popup acquisition retained its existing error; stylesheet security failure used the existing link fallback and both documents received the theme. Beginning a second drag replaced the first; popup pagehide, mouseup and unmount removed owned move/up listeners. Top and bottom direction, finite viewport clamping, NaN rejection and below70 close while retaining a usable reopen height passed without late component updates. SSR with no window rendered no shell; StrictMode retained exactly one keyboard and unload listener after setup and removed them on unmount.

The runner joined with exit0. Evidence is `/tmp/zerospin-framework-goal-tooling-135-mounted.log`. These are mounted production React/controller checks with controlled Window capabilities; they do not claim an actual Chrome popup permission, stylesheet or viewport observation. Existing dead Profiler/import removal and source gates remain established above.

## Remaining work

None.
