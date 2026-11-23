---
name: zerospin-test-authored-behavior
description: >-
  Use when writing or reviewing contained Zerospin backend behavior tests,
  exercising registered commands and recorded external work, or deciding what
  makeSystemHarness proves.
metadata:
  purpose: Verify authored command behavior with real declarations and isolated providers.
  type: core
  library: '@zerospin/sdk'
  library_version: '46.0.0'
requires:
  - zerospin-parallel-models
---

# Test authored backend behavior

Load `pnpm exec intent load @zerospin/sdk#zerospin-parallel-models` before
constructing test data.

Use `makeSystemHarness` from `@zerospin/sdk/testing` in scoped `it.effect`
tests from `@effect/vitest`. Supply the application's actual System and registered
releases. Create and change model rows through commands; do not insert fixtures
directly into model tables.

Push the command under test, then call `harness.flush()` to execute queued
external and command operations, including registered command continuations, before querying or asserting their effects.
Substitute provider services with Effect Layers; never call live providers.
Keep setup local and concise, with one representative success and rejection
where those outcomes exist.

The harness accepts complete Actor, Agent and System commands through `push`.
Actor commands carry captured claims and their complete Node/session/push tuple;
execution checks their exact grant, runs owner guards with Actor context and
uses captured Actor selections for contract reads. Agent and System commands
require their corresponding explicit grants and receive null claims. The Layer
factory's `executeServiceCommand(release, input)` remains System-only and returns
an `outcome`. The harness does not verify credential authentication or distributed
admission; test those at their actual runtime boundaries.
Contained tests verify authored behavior, not Durable Object delivery, browser
synchronization, or production behavior.

Run the application's existing backend test target through its workspace Nx
command when configured. Keep type/build checks distinct from behavioral
evidence, and report any required check that remains unrun.
