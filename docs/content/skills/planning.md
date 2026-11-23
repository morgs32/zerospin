---
title: Planning
description: Make contract changes and new external or async workflows clear before implementation.
order: 1
---

## Show contract changes with inline diffs

Whenever a plan changes a contract, include focused before/after snippets that
imitate an inline Git comparison. Use fenced `diff` blocks: prefix removed lines
with `-` and added lines with `+`, and retain enough unchanged context to make
the change understandable. Label each snippet with its file or contract name.

For example, this excerpt proposes renaming a contract payload field:

```diff title="src/createNoteV1.ts"
  payload: {
    id: primitives.id({ abbreviation: 'nte' }),
-   text: primitives.text(),
+   body: primitives.text(),
  },
```

Include matching program and caller changes when they are affected. Ground the
before snippets in current source and show the intended after state explicitly.

## Diagram new external contracts and async operations

Whenever a plan adds an external contract or async operation, include clearly
labeled **Before** and **After** diagrams of the existing and proposed workflows.

Show the initiating command, where the async request is recorded and committed,
the external request, the retained response, and the continuation. Make the new
steps and the owners responsible for them clear, including which work happens
after commit.

See [Contracts and operations](/handbook/contracts-and-operations) and
[External work](/handbook/external-work) for the boundaries these plans describe.
