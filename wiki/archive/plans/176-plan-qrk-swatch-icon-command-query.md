# QRK Swatch and Icon saves the selected SVG synchronously

**Date:** 2026-10-15  
**Status:** Complete; scoped builds and source review passed.  
**Owner repository:** `qrk.sh`  
**Parent:** [command/query UI cleanup](160-plan-command-query-ui-cleanup.md)

## Implemented outcome

1. API [`searchIcons`](../../../../qrk.sh/apps/api/modules/swatchAndIcon/searchIcons.ts)
   returns each result's `{ hash, name, svg }` without a redundant encoded preview.
   Record traversal uses `mapValues`. API now declares the existing workspace
   `es-toolkit` dependency through the package manager.
2. [`MaterialSymbolsIconLookup`](../../../../qrk.sh/apps/library/modules/swatchAndIcon/MaterialSymbolsIconLookup.tsx)
   derives its preview data URL and passes the complete selected icon. Search,
   debounce, pagination, busy/error presentation and selected identity remain
   transient chooser state.
3. [`SwatchAndIconForm`](../../../../qrk.sh/apps/library/modules/swatchAndIcon/SwatchAndIconForm.tsx)
   retains only an unsaved icon/color draft initialized from the queried/default
   state. Save validates the complete hex color/module state and synchronously
   stages the existing `updateBrick`. Refusal preserves the draft; successful
   staging clears it. Query state owns saved presentation and rollback.
4. Save-time icon lookup, save busy/controller state and the unused `getIconSvg`
   API/provider function are deleted after caller search. The catalog stays in
   the API Worker. Color-only edits and saving the default empty-hash icon need
   no network request. Existing full-state validation/trust boundaries remain.

```ts
// 1. A transient search choice retains all data needed to save.
onChange({ hash: icon.hash, name: icon.name, svg: icon.svg });
// 2. Save builds state from the local draft and validates it.
const state = decodeSwatchState({ payload: { hash, color }, data: { name, svg } });
// 3. Existing ordinary command staging returns its real local result.
const result = onSave(state);
// 4. Only successful staging clears the draft; saved UI reads the brick query.
if (result._tag === "Success") clearDraft();
```

## Verification

Final evidence: `pnpm nx run-many -t build:app,build -p
@qrk.sh/library,@qrk.sh/studio,@qrk.sh/api` passed all four tasks.
The subsequent `@qrk.sh/library:build` passed after adding explicit state/spec
revision comparisons to the genuine pre-save measurement baseline.

Library reusable/app, Studio app and API Worker dry-run builds passed. The final scoped
rerun passed after owner notification and search traversal updates. Caller search
confirms `getIconSvg` is absent from production sources and Save has no provider
request. No new test file, fixture, runner, suite or check gate was introduced.

## Remaining work

None.
