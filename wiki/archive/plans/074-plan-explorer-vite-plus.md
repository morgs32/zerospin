# Explorer Vite+ migration

## Approved work

Migrate Explorer's development, build, preview, lint, formatting, and type checks
to a pinned project-local Vite+ toolchain. Keep Nx as the workspace task runner,
preserve shared lint and formatting rules, and retain Explorer's source catalog,
architecture diagrams, and SharedWorker integration.

## Implementation

1. Install Vite+ and its matching Vite core alias in Explorer. Narrow the shared
   Vite override to ordinary Vite 8 dependencies so it cannot replace Vite+'s
   core alias. Preserve other projects' toolchains.
2. Switch Explorer's commands and configuration imports to Vite+. Expose shared
   Oxc settings through the root Vite+ configuration, move Explorer's existing
   lint overrides there, and add the integrated static check command. Pin the
   bundled Oxlint and Oxfmt versions locally because Vite+ prefers tools resolved
   from the working directory, which otherwise selects older root dependencies.
3. Update Explorer's run instructions and Nx cache inputs for shared settings.
4. Verify the scoped Nx checks, production build, development server and preview.
   Confirm that Explorer and its plugins resolve the intended Vite toolchain.

## Implementation outcome

1. Explorer uses Vite+ 1.1.0 and the matching core alias, Oxlint 1.87.0 and Oxfmt
   0.72.0. React and Tailwind plugins resolve the same core. The shared Vite 8
   override leaves that alias intact; other projects retain ordinary Vite.
2. All frontend and static check commands run through `vp`, scheduled by Nx.
   The root Vite+ config reads the existing shared Oxc settings and retains
   Explorer's prior lint policy. The superseded Explorer JSON lint config is
   removed. Script sources participate in Explorer's compiler project.
3. The scoped Nx graph passed build, combined check, typecheck, lint and
   formatting: 21 tasks including dependencies. The RPC catalog's 13 tests and
   architecture parser's five tests passed. Nx Cloud's access error (401) does
   not affect these successful local checks.
4. Development and preview serve `/`, `/invocation`, `/rpc` and `/architecture`
   with HTTP 200 on ports 3040 and 3041. Both running servers use Vite+ core.
   The production Invocation page renders and its standalone SharedWorker
   example reaches **Session ready**. Root Oxlint still resolves its established
   configuration. The scoped diff passes whitespace validation.

Completed on 2026-10-08. Concurrent application and backend edits were preserved.

## Remaining work

None.
