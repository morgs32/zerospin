# Zerospin docs

The docs app serves the developer documentation at <https://docs.zerospin.localhost/>.

## Content ownership

`content/handbook/`, `content/guides/` and `content/reference/` explain public
concepts, application authoring and API usage. Articles require nonempty `title`
and `description` plus numeric `order` frontmatter; the existing sections build
navigation automatically. Link between articles with `/handbook/...`,
`/guides/...` and `/reference/...` routes. `/docs` redirects to the quickstart.

Start with the [quickstart](content/guides/quickstart.md),
[session concepts](content/handbook/sessions-and-synchronization.md) or
[authored-behavior testing](content/guides/test-authored-behavior.md).
Implementation ownership, SQL boundaries, transport and recovery belong in
[wiki architecture](../wiki/architecture/AuthoredSystem.md). Source-module
READMEs under `packages/*/src/` are consolidated there and in the docs app; do not
recreate them. Package and operational test READMEs retain their own purpose.

## Development

```sh
pnpm nx run docs:dev
```

Portless assigns the Next.js port and registers the docs on the shared HTTPS proxy.

## Build

```sh
pnpm nx run docs:build
```

## Preview

```sh
pnpm --filter docs preview
```

Serves Next on `PORT` or `12014`.

## Storybook

```sh
pnpm --filter docs storybook
```

Serves Storybook on `PORT` or `12020`.
