# Zerospin CLI

`dev` loads `zerospin.config.ts` and its `ownerReleaseSources` from the
project. It builds the Worker executables from the checkout and starts one
local Workerd session with `SystemWorker`, a Worker for each registered
Aggregate or Service release, and `AgentWorker`. Each Worker has the same
ownership and bindings as in deployment. `deploy` owns Cloudflare
publication and traffic promotion.

Environment binding lookup stays rooted in the project, retaining Wrangler's
`.dev.vars`/`.env` precedence. The local `SystemWorker` accepts the startup
SystemSpec and initializes the System before the CLI reports readiness.
Restart `dev` after editing declarations or application Wrangler configuration.

`--state-dir` selects the parent directory for System storage. Startup refuses
older co-located and split-Worker layouts before opening their state, including
when you pass `--clean`. Select an empty `--state-dir` to develop alongside
that state. For a compatible local history, `--clean` retires the current
System's backend storage. `--shared-r2` links Wrangler's local R2 directory
into the active System history and preserves the shared R2 data through a clean.

After `--clean`, connected browsers use the recorded history replacement on
their next authenticated connection to select a new local Node database.
Stop any other Zerospin Worker using the same System storage before cleaning it.

The CLI closes Wrangler and removes the temporary configurations and bundles on
exit. Restart after changing authored code to build a new set of executables.

Each mounted ProcedureStep owns an AbortController for its initial program.
Unmount aborts the Effect and closes its scopes; disposed components ignore late
completion. Only a sole typed failure is shown as that error. Mixed Causes retain
the full Cause in the unexpected-error diagnostic. Seed modules export a named
`seeds` program with the shape `(api: ISystemApi) => Effect<void, unknown, never>`.
The program executes typed System-granted commands in its authored order, checks each
canonical `outcome.result`, and stops on business Failure. Stable command IDs recover
previously admitted outcomes when rerun; earlier command transactions remain committed
if a later command fails. The CLI reports “Seed program completed” for successful void
completion and does not count submitted commands.

## Self-hosted deployment

Run `zerospin deploy` from the backend project on your laptop with your
Cloudflare credentials. Run one deploy at a time. The CLI derives the
System Worker name from the authored System name in the selected account
and verifies the serving Worker's identity. On the first deploy, it uploads
an ingress-closed System Worker after Cloudflare confirms that the Worker is
absent.

The CLI checks retained declarations and namespace bindings before publishing
release Workers. It stages the candidate at 0%, verifies the exact Worker
versions and bindings, and asks the candidate to accept its SystemSpec. It
rechecks the staged deployment immediately before promoting the candidate.

A fresh self-hosted System gives `AgentWorker` the Agent Node namespaces.
Redeploys keep the serving placement and namespace IDs. After promotion the
CLI verifies the executing SystemRepo version, finishes AgentWorker activation,
and initializes the System. The first deploy opens ingress after initialization.
The CLI prints progress and reports **Live** when these checks succeed.

## Optional telemetry

Application `makeConfig` accepts portable deployment telemetry separately from
the authored System. The
[schema](../core/src/system/TelemetryConfigSchema.ts) has independent `otlp`
and `cloudflare` sections. Omitting either disables that integration; local
Effect capture remains available in profiles and Devtools.

Direct application OTLP requires `tracesEndpoint`, `logsEndpoint` and an explicit
`samplingRate` from zero to one. `headers` holds nonsecret header values;
`secretHeaders` maps header names to Worker binding names. Node config loading
validates these declarations without requiring the binding values. Worker
execution resolves those values and skips unavailable delivery without changing
the domain outcome. No telemetry account or destination is provisioned by the
CLI.

[Development workspace acquisition](./src/dev/openDevelopmentWorkspace.ts)
resolves declared secret names from project-local Wrangler environment bindings
first, then the process environment. Wrangler retains `.dev.vars`/`.env`
precedence. Present values enter development as secret bindings, independently
of the generated config directory.

[Deployment loading](./src/deploy/utils/loadDeploymentProject.ts) selects only
present nonempty process values for declared secret names.
[Workspace acquisition](./src/deploy/utils/openWranglerDeploymentWorkspace.ts)
removes these values from the Wrangler subprocess environment and writes them
to temporary files with mode `0600`. The stable Worker receives the telemetry
values and framework keys. Release Workers and `AgentWorker` receive only the
telemetry values. The uploads use `--secrets-file`. The CLI reuses registered
release Workers and deletes the temporary files during scoped cleanup.
Wrangler
[preserves remote secrets omitted from that file](https://developers.cloudflare.com/workers/configuration/secrets/#upload-secrets-alongside-code).
Removing a binding declaration does not delete its remote secret.

Cloudflare-native signals are generated by
[`makeWranglerConfig`](../dev-worker/src/makeWranglerConfig.ts). Each enabled
native signal requires explicit `samplingRate` and `persist`; logs also require
`invocationLogs`. Optional `destinations` names existing Cloudflare-managed
destinations. These settings provide platform visibility independently of
application OTLP and do not reproduce the Effect application hierarchy.
Native observability configuration is shared Worker state, applied by
`versions deploy` even when a
[staged candidate](./src/deploy/utils/stageSystemWorkerUpdate.ts) has zero traffic; it is not
isolated to that version's rollout percentage.

## Local Declaration Board

`zerospin studio` loads `.env.local`, then `.env`, and imports the authored
`zerospin.config.ts` from the current project. It projects `config.system` into
SystemSpec metadata without a deployment connection, secret key, seeds, or a
typecheck. The Node-owned RSC host renders the shared Declaration Board at
the selected loopback port and opens the browser. Port selection is
`--port <number>`, then `PORT`, then `5555`, with integers from 1 to 65535.
When Portless supplies `PORTLESS_URL`, Studio opens and prints that friendly
HTTPS URL while the Vite listener remains on loopback HTTP. Only serialized declaration
metadata crosses the server/client boundary. Restart the command after changing
declarations; unmounting the command cancels startup and disposes its server.

Repo/table inspection lives in the Zerospin Cloud customer console under an
Instance. Trace pages and external provider links are deferred.

Application diagnostic export has a bounded execution-owned lifetime. Delivery
does not acknowledge provider indexing or retention, and failures preserve the
domain result. There is no local diagnostic SQL fallback or admission-audit
binding. Authentication and authorization do not depend on diagnostic persistence;
hosted telemetry does not promise permanent admission-audit retention.
