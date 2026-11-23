---
title: Build shared data with services
description: Use Shopping's marketplace to separate shared ownership from each actor's selected local view.
order: 8
---

## Prerequisites

Know [the owner model](/handbook/aggregates-and-services), [authentication](/guides/authenticate), and [local command staging](/guides/write-commands). Shopping's `marketplace@1` owns the shared product catalog. The `user@1` aggregate owns a shopper's cart, cart items, purchases and purchase items.

Place commands that require ordered, atomic personal state together. Cart edits and checkout share the user aggregate's journal; they do not wait for a separately delivered Marketplace cart.

## Register the shared catalog

[marketplaceServiceReleaseV1.ts](https://github.com/morgs32/zerospin/blob/main/examples/shopping/src/zerospin/services/marketplace/marketplaceServiceReleaseV1.ts)
registers the product model and catalog Actor. That Actor explicitly grants
`createProduct` and `deleteProduct`. The release also grants the same canonical
`createProduct` through `system`, so the [seed program](/reference/cli#run-a-named-seed-program)
can create the catalog without inventing a second contract. The System registers
this release under `services.marketplace[1]`.

The catalog Actor authenticates Clerk and selects products. Its Actor grant does
not grant System execution for `deleteProduct`. Product prices use integer cents;
the UI formats them for display. A browser's selected catalog row is display data;
payment uses an authoritative quote.

## Author each session for its owner

`catalogSessionDefinition.ts` declares the Marketplace service session exposing products.
`shopperSessionDefinition.ts` declares the user aggregate session exposing its cart
and purchase graph. The authenticated route calls `useConnectedServiceSession`
and `useConnectedAggregateSession` with their separate worker URLs, application
layer and credential settings. Nested `SessionProvider` modules publish both handles;
`SessionReady` gates their dependent readers. Hook `onFailure` observers stay active
through initialization and recovery.

Product cards render catalog data and synchronously stage `addToCart` through `useSession(shopperSessionDefinition)`. The command retains a product ID and display snapshots in the personal cart. These rows have no cross-owner relational reference or authority to create Marketplace products.

## Keep personal changes ordered

`addToCart({ newCartId, newCartItemId, product, amount })` reuses the existing cart and product line or creates them from the supplied creation IDs. Each staging transaction sees preceding optimistic edits, including clicks made before React rerenders.

Checkout freezes those lines into purchase items and sets `cart.checkoutPurchaseId` in the same owner-local transaction. Cart edits and another checkout are refused while the linked purchase is preparing, awaiting payment or awaiting payment reconciliation. One live query reads the cart and linked purchase. No command-history watcher, first-cart waiter or acknowledgement Promise is needed in the component.

Aggregate and service command staging both return synchronous local results. Background persistence and delivery belong to the session. Expected command refusals are presented through the application's session notification layer.

## Read authoritative prices across owners

The user aggregate schedules `getExternalPurchaseQuote`. Its backend request uses
the configured `ShoppingSystemApi.executeServiceQuery` capability to read a typed
Marketplace product selection, then derives the quote from those current rows.
The request carries frozen line identities, product IDs and quantities, rather
than prices supplied by the browser. The read creates no command or outcome and
reserves no prices for a later command. Expected quotation refusals are typed data. The user continuation validates correspondence and totals before recording prices and scheduling payment. A read-only quote failure can safely refuse checkout and unlock the unchanged cart because payment has not begun. An uncertain payment remains locked for reconciliation.

No owner holds a model transaction across the network request. Continue to [Server and external work](/guides/server-and-external-work) for the complete checkout flow.

## Check the behavior

Use Shopping's existing scoped source checks and
[authored-behavior tests](/guides/test-authored-behavior) for consecutive cart edits,
local and authoritative refusals, quote correlation and payment outcomes. Verify
durable delivery through the backend runtime's checks. Shopping prohibits
browser-driven verification.
