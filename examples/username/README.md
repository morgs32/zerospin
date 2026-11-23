# Username example

Each `user` aggregate stores a single row, `usr_user`. On a hosted release,
`userActorV1.authorize` reads that row and executes `createUser` when it is
missing. The hosted session exposes `updateUsername`. Its empty demo
credentials grant access to the requested aggregate ID, so use a real identity
provider before exposing it publicly.

## Storybook

From the workspace root, run:

```sh
pnpm nx run @zerospin/username-example:storybook
```

Open [Username Storybook](https://username.zerospin.localhost/) in Chromium.
The standalone session uses a SharedWorker and local SQLite. Story setup
stages `createUser` once for the new aggregate. Enter a name and select **Save**
to see the greeting. Submit a blank or whitespace-only name to store null and
clear the greeting.
