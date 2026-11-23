---
name: zerospin-reboot-system
description: >-
  Use when the user requests a Zerospin System reboot or a fresh System history,
  replacing the affected authored releases and state instead of retaining them.
metadata:
  purpose: Establish a coherent fresh System history with explicitly scoped state.
  type: core
  library: '@zerospin/sdk'
  library_version: '47.1.0'
requires:
  - zerospin-parallel-models
---

# Reboot a Zerospin System

A System reboot starts an independent, empty Zerospin catalog and command
history for a System, then authors its intended declarations as the initial
releases. Process restarts and migrations follow their own workflows.
Read the [System reboot handbook](https://github.com/morgs32/zerospin/blob/main/docs/content/handbook/versioning-and-deployment.md#reboot-a-system)
and load `pnpm exec intent load @zerospin/sdk#zerospin-parallel-models`.

1. Establish which System and environments are in scope and whether the user
   intends to discard their existing history. Inspect the actual storage and
   consumers. A fresh `systemId` selects an independent System; reusing an ID
   requires that the affected catalog and owner storage actually be empty. The
   earlier System's storage stays in place when selecting a different ID. Follow the
   [storage preflight](https://github.com/morgs32/zerospin/blob/main/docs/content/guides/develop-and-deploy.md#inspect-storage-before-a-framework-rollout)
   for an existing deployment or an unknown compatibility boundary.
2. Identify affected backend stores, browser Nodes and pending commands, seed
   data, and external objects or provider records. Preserve state outside the
   authorized scope. Any reset requires explicit authorization for the affected
   storage. `zerospin dev --clean` removes the selected local backend state.
   Browser and external storage have separate lifecycles.
3. Compose the intended initial Aggregate and Service releases with their
   models, contracts, Actors, Agents, external implementations and seed behavior.
   Align browser sessions, System API callers, Agent Nodes and command
   destinations with the new System identity and exact release bindings. Use
   command execution or replay for model changes after seed.
4. Follow the [System registry rule](../zerospin-parallel-models/SKILL.md#system-registry-changes).
   Before changing `system.ts`, present the exact before-and-after snippets for
   the user's approval. An agent may then make the approved changes. An
   independent new System has its own initial registry.
5. Verify startup, seed, session admission and representative reads and writes
   against the fresh System. Exercise any in-scope Agents and external effects;
   report which environments, persistent stores and consumer paths were actually
   checked. Report compatibility with prior history only when it was verified.
