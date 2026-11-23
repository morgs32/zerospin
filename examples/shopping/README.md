# Shopping

Shopping serves at <https://shopping.zerospin.localhost/>.

| Area      | Worker                             | Pure manifest                |
| --------- | ---------------------------------- | ---------------------------- |
| Shopper   | `src/zerospin/shopper.worker.ts`   | `shopperSessionDefinition`   |
| Catalog   | `src/zerospin/catalog.worker.ts`   | `catalogSessionDefinition`   |
| Promotion | `src/zerospin/promotion.worker.ts` | `promotionSessionDefinition` |

## Development

```sh
pnpm --filter shopping dev
```

## Development sign-in

Open [the development login URL](https://shopping.zerospin.localhost/__dev/log-me-in/morgan.intrator%40gmail.com?returnTo=/)
in your browser. Replace the email with an existing user in Shopping's Clerk
development application. The frontend needs matching development
`VITE_CLERK_PUBLISHABLE_KEY` and server-only `CLERK_SECRET_KEY` values in its
ignored `.env.local` or server environment.

This establishes a normal Clerk session without creating users or changing
Shopping permissions. `returnTo` accepts a safe path on the same origin and
otherwise falls back to `/`. The route returns 404 in production. See
[AGENTS.md](./AGENTS.md#development-sign-in) for details and verification restrictions.

## Portless

```sh
portless get shopping.zerospin
```

## Zerospin backend

```sh
pnpm --filter shopping zerospin:dev
```

Serves the backend on `ZEROSPIN_PORT` or `12002`.

### Replay one cart across user releases

This walkthrough verifies replay across local Aggregate release Workers.
Each start builds the registered releases from the checkout.
Build the workspace CLI with `pnpm nx run @zerospin/cli:lib`, then switch to
`examples/shopping`. [`latestUserRelease`](src/zerospin/userReleaseSelection.ts)
selects the latest registered `user` release. The shopper session and the cart
command below address that release. All three releases use the same
cart models. `user@2` branches from `user@1`, and `user@3` rebuilds from
`user@2`. The `purchases@1` Agent binds `user@1`, which declares its
`createTrackingLabel` and `updateTrackingInfo` grants.

1. Set `latestUserRelease` to `1`. In the backend terminal, create a temporary
   state directory and start the backend. Reuse this directory for every step.

   ```sh
   SHOPPING_STATE_DIR="$(mktemp -d)"
   pnpm exec zerospin dev --port 12002 --state-dir "$SHOPPING_STATE_DIR"
   ```

2. In a second terminal in `examples/shopping`, set `ZEROSPIN_API_URL` to the
   Shopping backend URL printed by that process. Run the following command once
   after the backend reports ready.

   ```sh
   ZEROSPIN_API_URL="${ZEROSPIN_API_URL:?Set the local Shopping backend URL}" ZEROSPIN_SECRET_KEY=sk_dev pnpm exec zerospin seed ./src/zerospin/addReleaseCartItem.ts
   ```

3. Stop the backend, set `latestUserRelease` to `2`, and rerun the same
   `zerospin dev` command with the existing `SHOPPING_STATE_DIR`. Run the seed
   command once.
4. Repeat step 3 with `latestUserRelease` set to `3`. The third call addresses `user@3`, which
   evaluates both earlier commands, including the position `user@2` inherited.

Each call executes the System-only `addReleaseCartItem` contract on the same
cart and reads the resulting quantity from the addressed release. The
`user@1` and `user@2` programs add one mug per evaluation. The `user@3`
program adds two. The expected quantities are 1, 2, and 6. After the third
command replays in `user@2`, its quantity advances to 3.

## Local telemetry

Start [local Grafana](../../README.md#local-telemetry), then add
`ZEROSPIN_TELEMETRY=1` to this example's `.env.local` and restart its Zerospin
backend. A shell-only flag does not reach the Worker. If `.dev.vars` exists,
include the flag there too because Wrangler uses it instead of `.env` files.

Open <http://127.0.0.1:12300> to find traces and logs for `shopping`. Local
telemetry is disabled when the flag is absent.

## Declaration Board

From this example directory, run `pnpm studio` to open
`https://studio.shopping.localhost` through the existing HTTPS Portless proxy.
Studio listens internally on `127.0.0.1:12030` and reads this example's
`zerospin.config.ts`. This command is separate from `dev:app`; it requires no
backend process or Zerospin secret.

For a direct local listener, use `pnpm exec zerospin studio --port 12030`.
