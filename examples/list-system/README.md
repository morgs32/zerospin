# List System

This System stores independent lists of items. Its `list` Aggregate release
grants the System the `addListItem` command. Choose an Aggregate ID to select a
list and submit a payload such as `{"id":"lit_example","text":"Milk"}`.

## Storybook

If the Portless HTTPS proxy is stopped, run
`pnpm exec portless proxy start --port 443 --https --wildcard` in your terminal.

From the workspace root, run:

```sh
pnpm nx run @zerospin/list-system-example:storybook
```

Open [List System Storybook](https://list-system.zerospin.localhost/)
in Chromium. The **List System / Add and reopen** story uses a standalone
session backed by a SharedWorker and local SQLite. Add an item, then choose
**Reopen list** to open the same list in a new session. The story's interaction
checks that the item appears once after reopening.

## iPhone package

Build the iPhone package from this directory:

```sh
zerospin package --platform ios
```

Publish `dist/zerospin-system.zip` as a GitHub Release asset. The package
contains executable System code; install it only from a trusted repository.

Build this example in the Zerospin workspace so the SDK and CLI come from the
same release. When building outside the workspace, pin both packages to the
same version with support for `zerospin package --platform ios`. The iPhone
loads the published System package directly.
