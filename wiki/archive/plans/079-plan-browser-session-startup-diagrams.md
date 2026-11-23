# Make browser session startup and SharedWorker synchronization obvious

**Status:** Complete. Implemented on 2026-10-09. Verification excluded by the user.

## Problem and agreed behavior

1. The current WebSocket diagram hides its runtime ownership and the browser-tab caller. It combines connection setup and server catch-up without showing when attachment returns or the tab becomes initialized.
2. Tell one startup story in two consecutive diagrams: **Browser session startup: connect the SharedWorker**, then **Browser session startup: catch up and initialize the tab**.
3. The tab starts initialization. The SharedWorker owns the persistent Node and server WebSocket. Successful online attachment waits for catch-up, then the tab subscribes and initializes its separate SQLite view.
4. Describe first online startup explicitly. Fresh Node storage installs one authenticated baseline; retained storage resumes committed progress. Reconnect and offline operation preserve their existing semantics.

## Implementation steps

1. Rewrite the application-session portion of [SessionWebSocket.md](../../architecture/browser/SessionWebSocket.md) into the two source-grounded sequences, with runtime boxes, numbered messages, matching annotated steps, linked handoff summaries and recovery notes. Preserve the separate administrative workflow and its page identity.
2. Replace the former application diagram ID in Explorer's participant metadata and RPC links. Give every new participant an accurate runtime role and source reference. Add no compatibility routes.
3. Explain the online synchronization wait in [browser bootstrap](../../architecture/browser/bootstrapBrowserSession.md), and update the architecture index description.
4. Refresh affected documentation source hashes and citation ranges. Reuse the existing glossary's durable browser node and session terms. No new domain concepts or architecture decisions require glossary additions or an ADR.
5. Record the outcome, set remaining work to None, and archive this plan with its filename preserved.

## Planned files

`+` creates a file, `~` modifies it. The completed plan moves to `wiki/archive/plans/`.

```text
zerospin/
├── wiki/
│   ├── plans/
│   │   └── + 079-plan-browser-session-startup-diagrams.md
│   ├── architecture/browser/
│   │   ├── ~ SessionWebSocket.md
│   │   └── ~ bootstrapBrowserSession.md
│   └── ~ index.md
└── explorer/src/data/
    ├── ~ sequenceParticipantDetails.ts
    └── ~ rpc-method-explanations.ts
```

## Acceptance criteria and permitted checks

1. The diagram starts at the browser tab and identifies the SharedWorker as the Node and WebSocket owner.
2. The two pages join at the sent resume checkpoint. Ordered replay commits precede replay completion, online state and the attached capability's return.
3. Subscription captures the worker's Node state and initializes the tab projection. Initial attachment, server-socket reconnect and offline operation remain distinct.
4. Checkpoint conflicts block synchronization while preserving storage. Retryable connection loss remains distinct from a conflict.
5. Runtime behavior, APIs, schemas and `mermaid-flow` stay unchanged. Preserve the earlier `App.tsx` participant label and unrelated session-runtime work.
6. The user explicitly requested no tests, builds, browser checks or verification runs under yolo mode. Those checks are excluded from this plan and will not be reported as passed.

## Implementation outcome

1. Replaced the application WebSocket overview with two consecutive source-authored sequences: browser-tab attachment and SharedWorker connection, followed by server catch-up and local tab initialization. Both use runtime boxes and numbered messages with matching annotated source references.
2. The handoff joins at the saved checkpoint sent on the same WebSocket. Fresh Node baseline installation, persistent worker storage, synchronous tab projection commit, background queued delivery, checkpoint conflicts and reconnect/offline behavior are explicit.
3. Explorer participant descriptions and RPC diagram links use the two new page identities. The separate administrative diagram keeps its identity. No compatibility routes or runtime/schema changes were added.
4. The browser bootstrap documentation and architecture index now explain the online synchronization wait. Source hashes were refreshed during documentation authoring. Existing glossary definitions remain sufficient; no ADR was warranted.
5. The preceding App.tsx label and concurrent implementation work were preserved. No tests, builds, browser checks, or verification runs were performed, as explicitly requested. This records implementation completion, not a verified rendering result.
6. Explorer pages: [connect the SharedWorker](http://127.0.0.1:3040/architecture/browser/session-web-socket/browser-session-startup-connect-the-shared-worker) and [catch up and initialize the tab](http://127.0.0.1:3040/architecture/browser/session-web-socket/browser-session-startup-catch-up-and-initialize-the-tab).

## Remaining work

None.
