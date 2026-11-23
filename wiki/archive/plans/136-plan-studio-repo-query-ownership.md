# Bind Studio explorer rows to their exact request identity

Status: Implemented and verified in the approved goal on 2026-10-11.

The [Repo explorer](../../../packages/studio/src/RepoExplorer.tsx) keeps registrations/table data/errors/loading/refresh in separate local state and two abortable effects. Switching table names sets loading and clears the error but retains tableData, so rows from tableA can be displayed with tableB selected until its request settles. The current effects correctly abort stale requests; the missing invariant is that displayed data belongs to the exact displayed Repo/table identity. Studio already has request-keyed SWR reads in [agent IDs](../../../packages/studio/src/useAgentAggregateIds.ts) and ErrorExplorer.

1. Add `useRepoRegistrations` with one key containing the exact RepoType, and `useRepoTableData` with one key containing exact RepoType/repoName/tableName. Disabled/incomplete selection yields a null key. Fetch through the existing fetchStudioJson endpoint schemas and encoded route components; no secret key enters the browser. Keep current one explicit authenticated broker operation per API request.
2. Set keepPreviousData:false across request identity changes, no polling, and no automatic retry for definitive server failures. Same-key refresh uses mutate/revalidation and may retain only that same key's visible data while marking loading; data from a different key is never reused. Preserve typed public refusal messages and wire/schema decoding. Do not introduce another fetch/cache registry or hand-maintained refresh counter.
3. Derive loading/error/data from those keyed queries. Keep only user selection/search/JSON inspection state local. Own selected table/JSON cell in a Repo-identity-keyed pane so changing Repo identity unmounts that pane and clears its selection; changing table clears the inspected cell. A selected table must belong to the current registration's tableNames; removed table/registration clears or refuses that selection before fetching. Reacceptance/registered table-name changes from131 are consumed directly, not hardcoded into the UI.
4. Decode the injected SystemSpec once through the same SystemSpecSchema used by AgentExplorer rather than casting JSON.parse to ISystemSpec each render. Model/executable declarations still come from authored modules where needed; serialized SystemSpec is display metadata. Route interpretation must use Plan086's settled opaque component handling, never an additional fallback decoder or empty-segment-dropping parser.
5. Keep TableBrowser a passive presentation of names/rows/columns/status and JSON inspection. Source columns and rows must always come from the same successful query value. Retain current combobox/table accessibility, responsive inspector and real refresh button. Remove previousRepo/render-time reset state, the two manual effects and their correlated loading/error/data/refresh state rather than extracting those unchanged into a hook.

```tsx
export function RepoExplorer() {
  const route = readStudioRepoRoute(useLocation());
  const registrations = useRepoRegistrations(route.repoType);
  if (route.kind === 'home')
    return <StudioHome systemSpec={studioSystemSpec} repoTypes={repoTypes} />;
  if (route.kind === 'invalid') return <RepoRouteNotFound />;
  if (route.repoName === undefined)
    return <RepoRegistrationList route={route} query={registrations} />;
  return (
    <RepoTablePane
      key={JSON.stringify([route.repoType, route.repoName])}
      route={route}
      registrations={registrations}
    />
  );
}

function RepoTablePane({ route, registrations }: RepoTablePaneProps) {
  const selection = useRegisteredRepoTableSelection(route, registrations.data);
  const table = useRepoTableData(
    route.repoType,
    route.repoName,
    selection.tableName,
  );
  return (
    <TableBrowser
      {...selection.presentation}
      columns={table.data?.columns ?? []}
      rows={table.data?.rows ?? []}
      loading={table.isLoading || table.isValidating}
      error={table.error?.message ?? null}
      onRefresh={() => void table.mutate()}
    />
  );
}
```

The pane key includes repoType and repoName as an exact JSON tuple, with no delimiter splitting. Query keys are typed tuple values and retain opaque identifiers. No SQL transaction is added: the server already owns read-only table access and broker cancellation. Component disposal unsubscribes the current key; a late response may update its own cache entry but cannot be displayed under another key. Do not promise cancellation of SWR's shared fetch when another component still owns that key. Broker shutdown/disconnect still aborts admitted native requests through the existing server lifetime.

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
  packages/studio/src/
    ~ RepoExplorer.tsx
    + useRepoRegistrations.ts
    + useRepoTableData.ts
    + RepoTablePane.tsx
    + studioSystemSpec.ts # one validated display manifest shared with AgentExplorer
    ~ AgentExplorer.tsx # consume the shared decoded display manifest
    ~ TableBrowser.tsx # only query-status/selection integration if required
```

Affected consumers are the existing `/`, `/:repoType` and `/:repoType/:repoName` Studio routes. Broker request schemas, executeStudioRequest, SystemApi/getRepoRegistrations/getRepoTableRows stay the authority for credentials and table access. Existing server explorer fixtures can supply registration and table payloads; do not create new fixtures. This plan changes stale-table presentation deliberately and does not add SQL execution or a new inspector API.

Implementation order: implement exact keyed query hooks; introduce keyed selection pane; remove correlated manual request state; centralize injected manifest decoding; integrate opaque route handling from086; inspect current server/registration consumers; then run existing gates. No compatibility route or table aliases remain after owner/catalogue cutovers.

Verification: `pnpm nx run-many -p @zerospin/studio -t lib,ts,lint`. Existing actual Studio app plus `src/fixtures` and server/explorerFixtures provide API/data seams for rapidA->B table selection, failure onB, old request completion, same-key refresh, missing registration/table and unusual opaque names. No current stories directory exists, and build-storybook is not a behavioral check. Cases remain unrun during review; compilation cannot prove absence of stale UI. No tests/fixtures/runners/configuration are authorized.

Postimplementation: update explorer comments/README with request identity ownership; no new domain glossary or ADR is needed for using Studio's established keyed-query pattern. Archive after route integration, stale-state deletion and required checks finish.

## Implementation progress — 2026-10-11

The approved ownership cutover is implemented in production source and its direct
consumers. Root coordination owns required Nx gates and plan archival.

Studio `lib`, `ts` and `lint` passed in `/tmp/zerospin-goal-quality-8.log`. Exact scope keys, strict routes and current pane ownership were checked in source. Package/module README changes are written; normal mounted route/table/inspection replacement and controlled failure/loading/stale-completion checks are recorded below.

### Actual mounted Studio Repo selection — 2026-10-11

The independent Studio admin UI ran at `http://127.0.0.1:5555/` through the existing CLI with `BROWSER=none`, using the retained Shopping backend at 3005. Shopping application browser verification remained excluded. Native Chrome CUA navigated Repos → ServiceVersionRepo → registered Repo `svr_sys_shopping_20260907_pinned_replicas/marketplace/1.0.0` through its actual percent-encoded `%2F` URL. Every table toggle was initially unselected, with no previous table data or inspection. Selecting executedCommands displayed 13 rows with matching columns. The payload JSON inspector showed row1 command `cmd_WA5BwLq6cgkzyo3cMBjoI`.

Switching to product removed that inspector and the previous rows/columns, then displayed the actual 12 product rows with product columns. Refresh table retained those correct same-key rows; its loading transition was not sampled. Switching to modelOperations replaced the rows/columns with its actual 12 rows. Inspecting a body JSON cell and then refreshing cleared the inspector and retained correct same-key table output. Returning through Repos/Home and selecting SystemRepo `sys_shopping_20260907_pinned_replicas` showed all four table toggles initially unselected, no prior Repo data and no old inspector. Selecting acceptedDefinitions displayed seven rows; its key JSON inspector showed `["aggregateRelease","user","1.0.0"]`.

These actual observations establish normal opaque Repo routing, repository/table/column/JSON-inspection replacement and same-key refresh through existing controls. The Mac locked while the next malformed-route check was being attempted; `/NotARepoType` was not observed and is not counted. Loading/error/recovery, delayed completion under a replaced key, catalogue removal and unmount display fencing remain unrun. Component unmount must unsubscribe its keyed query and prevent another key from displaying its late result; aborting a shared SWR fetch is not an acceptance criterion. Startup evidence is `/tmp/zerospin-goal-mounted-studio-ui.log`.

Root requested owned Studio cleanup after recording these observations. Ctrl+C was delivered only to owned PTY session87655, which returned exit1; owned CLI9731 and parent9720 were absent, and port5555 had no listener. Evidence is `/tmp/zerospin-goal-mounted-studio-ui-cleanup.log`. This records process/listener release, not pending-request cancellation or graceful JS drainage. No browser action was taken; the current Studio Chrome tab remains open because the Mac is locked.

### Actual headless Studio broker refusal — 2026-10-11

The existing Shopping Studio CLI ran independently at 5555 with `BROWSER=none`
and its actual authored configuration. Ordinary GETs to
`/api/repos/NotARepoType` and
`/api/repos/SystemRepo/%/acceptedDefinitions` returned HTTP400 with
`studio-request-invalid`; the unknown broker path `/api/NotAStudioRoute` returned
HTTP404 with `studio-route-not-found`. Each response retained the declared
public failure shape, `extra: null` and `Cache-Control: no-store`, without the
development credential. A subsequent ordinary `/` GET returned HTTP200 and the
real Studio index, establishing server health after those rejected requests.
The broker rejected these inputs before remote API acquisition; no backend,
application browser, authored fixture, source/configuration change or build was
used. The inline request invocation exited 0. Evidence is
`/tmp/zerospin-goal-studio-136-headless-invalid-requests.json`.

Ctrl+C was sent only to owned session24726, which returned exit1. CLI25901 and
parent25892 were absent afterward, and 5555 was free. The lifecycle log contains
only dotenv information, with no exception or cleanup-failure diagnostic.
Evidence is `/tmp/zerospin-goal-studio-136-headless-invalid-cleanup.json` and
`/tmp/zerospin-goal-studio-136-headless-invalid.log`. This verifies HTTP request
schema/URI rejection, continued server health and owned process/listener release;
it does not establish mounted malformed-route output, React error/recovery,
keyed stale-response fencing or joined unmount cancellation.

### Authorized mounted query identity checks — 2026-10-11

Disposable `/tmp` fixtures now exercise the actual production `RepoTablePane`, MemoryRouter and SWR with installed ReactDOM19/Happy DOM and controlled HTTP responses decoded by the production fetch boundary. Initial loading was visible. Selecting B while A remained pending displayed only B's matching rows/columns; A's later completion could not replace them. Refresh cleared the JSON inspector; an actual declared HTTP failure displayed the error, and the next healthy same-key refresh removed it and restored correct rows. Removing a selected table declaration cleared inspection/data/selection. Unmounting one keyed Repo owner before its delayed response and mounting another prevented the old result from appearing under the new scope. Removing the registration displayed the existing unregistered-Repo state.

The production `RepoExplorer` was also mounted from a temporary bundle using its ordinary injected display manifest. Invalid RepoType, malformed percent encoding and extra/empty route components displayed the not-found state. A real authored TicTacToe manifest decoded successfully; malformed injected JSON failed its production schema. An opaque slash-containing Repo name remained exactly one percent-encoded component through registration and table request keys. Both runners joined with exit0 and released their DOM owners. Evidence is `/tmp/zerospin-framework-goal-tooling-136-mounted.log` and `/tmp/zerospin-framework-goal-tooling-136-routes.log`. These establish the required mounted display/request identity behavior without promising cancellation of SWR's shared fetch or actual Chrome response timing. No repository fixture/configuration or original storage changed.

## Remaining work

None.
