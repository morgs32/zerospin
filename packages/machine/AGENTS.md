# Machine package

- Export at most one function per source file. Split a second exported function
  into its own file; inline one-call wrappers instead of adding sibling files.
- Preserve the schema-bearing State declarations, placement-owned Machine
  programs, and application-owned ManagedRuntime and Actor start Fiber.

## Start from first principles

In design discussions and implementation, name the required behavior and sketch
the simplest end-to-end flow you’d build today before using existing code as a
starting point. Show the underlying calls. Keep a wrapper, state, or handoff only
if you can name the problem it solves. Remove machinery the design no longer needs.
