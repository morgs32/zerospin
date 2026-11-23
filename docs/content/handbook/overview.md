---
title: Zerospin in your application
description: Understand the pieces you author and how local application state becomes authoritative server state.
order: 1
---

## What you build

Zerospin lets you describe your application's data, the commands that change it, and the data each authenticated actor may see. Your React UI reads a local SQLite projection. An aggregate command can update that projection immediately, while a durable browser worker and the server carry the command through admission and execution.

The important pieces are ordinary TypeScript declarations:

| Piece                | Your decision                                            | Example                                                             |
| -------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| Model                | What a resource contains                                 | A game board, cart item, or purchase                                |
| Contract             | What a command accepts, checks, changes, and returns     | Play a square or add an item to a cart                              |
| Aggregate or service | Who owns those resources and commands                    | One game aggregate or the shared marketplace service                |
| Actor                | Which authenticated identity may read and act            | Human player, shopper, or catalog reader                            |
| Release              | The exact versions wired together and their dependencies | `game@1` with models, contracts, a human Actor and a provider Layer |
| Session definition   | What a browser needs for one capability                  | The human player's game session                                     |
| Session instance     | The live connection for one resource and identity        | This tab's game and player                                          |
| System config        | Where this authored system runs                          | A stable system ID                                                  |

You still build the application: routing, screens, authentication UI, notifications, and domain behavior. Zerospin supplies the command and projection machinery around those decisions.

## Read a runnable example first

Start with the [workspace quickstart](/guides/quickstart), then [build the first feature](/guides/build-first-feature). The [Tic Tac Toe source](https://github.com/morgs32/zerospin/tree/main/examples/tic-tac-toe) shows the whole path without a commerce domain: X stages a move locally; authoritative validation accepts it; an external server command chooses and applies O's response, even after the tab closes.

Use [Shopping](https://github.com/morgs32/zerospin/tree/main/examples/shopping) when you need authenticated users, shared services, cart ownership, checkout, payment, or fulfillment. Its contracts show where business rules must run against authoritative data and how a user aggregate requests authoritative catalog pricing before payment.

These docs describe **current unreleased workspace source**. Package manifests may have a published version number; that does not mean the registry package with that number contains the APIs shown here. Use the workspace setup in the quickstart and keep declarations, browser packages, and backend code from the same source revision.

## Applications this handbook is written for

The intended reader is a developer adding Zerospin to their own app. Three existing applications make the domain decisions concrete:

- **Red Rope Parking** has members, cars, and member-owned fleets. A command must verify fleet ownership before editing or moving a car.
- **QRK** has sites, pages, and library content. Its data gives a useful example of related resources, ordered content, and user-owned publishing state.
- **Stackshirts** has guest designs that can move into an authenticated account. A local guest session and an account session have different identities and lifetimes; importing a design is an explicit domain operation.

Those applications currently contain integrations authored against older Zerospin APIs. They establish the audience and domain examples; the snippets in this handbook follow the current upstream SDK and runnable Zerospin examples. Follow [adding Zerospin to an existing app](/guides/add-to-existing-app) when applying these ideas to a consumer application.

## Follow a command through the system

A browser creates a command from a contract name and payload. For an aggregate, staging evaluates the contract and commits its optimistic operations in the tab's transaction. This makes a game move visible immediately. A durable worker then retains and pushes the command. The server authenticates and admits it, evaluates the authoritative command, records its outcome, and updates actor projections. The browser reconciles its projection with those outcomes.

Aggregate and service staging share that synchronous local-commit boundary. Neither helper's success means the worker persisted or the server finalized the command. Read [sessions and synchronization](/handbook/sessions-and-synchronization) before displaying a server-confirmed receipt or triggering another irreversible action.

## Learn only the Effect you need

An `Effect` is a description of work that can return a value, fail, and require dependencies. `Effect.gen(function* () { ... })` lets you sequence that work; `yield*` runs a step inside the enclosing Effect. A `Layer` supplies dependencies for a runtime lifetime. Contract programs receive named recording methods and return Effects containing only their domain result. Yielding a recording method validates and collects a deferred description; the checked evaluator returns the complete validated `{ operations, result }` batch, and the owning workflow applies it in its transaction.

The handbook introduces each construct where it changes what your application does. You do not need to design a runtime: the browser session owns one privately, and the backend config supplies one for the system. Continue with [aggregates and services](/handbook/aggregates-and-services).
