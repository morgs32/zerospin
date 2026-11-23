import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Redacted from 'effect/Redacted';

/**
 * Captures the arguments and exit of a `makeFn` invocation on
 * that function's span. The snapshots are deliberately bounded and converted
 * to JSON-safe values before they are attached to telemetry.
 */
export const annotateFunctionSpan = <
  A,
  E,
  R,
  Args extends ReadonlyArray<unknown>,
>(
  effect: Effect.Effect<A, E, R>,
  ...args: Args
): Effect.Effect<A, E, R> => {
  /**
   * This local recursive function is the only traversal used by the approved
   * span annotation. Keeping it here prevents the snapshot policy from becoming
   * a second public utility or an independently reusable serialization format.
   */
  const snapshotValue = (
    value: unknown,
    depth: number,
    visitedValues: { count: number },
    objectsInCurrentPath: WeakSet<object>,
  ): unknown => {
    // 1. Bound total work before inspecting the value. The first 200 values are
    // represented; every later value becomes the same explicit limit marker.
    visitedValues.count += 1;
    if (visitedValues.count > 200) {
      return '[Visited Value Limit]';
    }

    // 2. Redacted values are recognized before any object inspection so their
    // wrapped secret cannot be reached through properties or custom prototypes.
    if (Redacted.isRedacted(value)) {
      return '[Redacted]';
    }

    if (value === null) {
      return null;
    }

    if (value === undefined) {
      return '[Undefined]';
    }

    if (typeof value === 'string') {
      if (value.length <= 2_000) {
        return value;
      }

      return `${value.slice(0, 1_988)}…[truncated]`;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      if (Number.isNaN(value)) {
        return '[Number: NaN]';
      }

      if (value === Number.POSITIVE_INFINITY) {
        return '[Number: Infinity]';
      }

      if (value === Number.NEGATIVE_INFINITY) {
        return '[Number: -Infinity]';
      }

      return value;
    }

    if (typeof value === 'bigint') {
      const marker = `[BigInt: ${value.toString()}]`;
      if (marker.length <= 2_000) {
        return marker;
      }

      return `${marker.slice(0, 1_988)}…[truncated]`;
    }

    if (typeof value === 'symbol') {
      const marker = `[Symbol: ${value.description ?? ''}]`;
      if (marker.length <= 2_000) {
        return marker;
      }

      return `${marker.slice(0, 1_988)}…[truncated]`;
    }

    if (typeof value === 'function') {
      const marker = `[Function: ${value.name || 'anonymous'}]`;
      if (marker.length <= 2_000) {
        return marker;
      }

      return `${marker.slice(0, 1_988)}…[truncated]`;
    }

    // 3. Objects at the depth boundary are not inspected. This check happens
    // after primitive handling so a primitive at depth four remains readable.
    if (depth >= 4) {
      return '[Depth Limit]';
    }

    // 4. Only objects already on the active recursion path are circular. A
    // shared object reached through two independent branches is snapshotted in
    // both places instead of being incorrectly labelled as a cycle.
    if (objectsInCurrentPath.has(value)) {
      return '[Circular]';
    }

    if (Array.isArray(value)) {
      objectsInCurrentPath.add(value);

      try {
        const snapshot: unknown[] = [];
        const entriesToSnapshot = value.length > 50 ? 49 : value.length;

        // 5. An over-limit array reserves its fiftieth entry for a visible
        // truncation marker, so the emitted collection never exceeds 50 items.
        for (let index = 0; index < entriesToSnapshot; index += 1) {
          snapshot.push(
            snapshotValue(
              value[index],
              depth + 1,
              visitedValues,
              objectsInCurrentPath,
            ),
          );
        }

        if (value.length > 50) {
          snapshot.push(`[${value.length - 49} entries truncated]`);
        }

        return snapshot;
      } finally {
        objectsInCurrentPath.delete(value);
      }
    }

    const prototype = Object.getPrototypeOf(value);
    if (
      !(value instanceof Error) &&
      prototype !== Object.prototype &&
      prototype !== null
    ) {
      const constructorName = prototype.constructor?.name;
      return `[Instance: ${constructorName || 'unknown'}]`;
    }

    objectsInCurrentPath.add(value);

    try {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const keys = Object.keys(descriptors);
      const entries: Array<[string, unknown]> = [];
      const entriesToSnapshot = keys.length > 50 ? 49 : keys.length;

      // 6. Property descriptors avoid executing getters while telemetry is
      // being captured. Sensitive property names are masked before their values
      // are inspected, including common camelCase and separator variants.
      for (let index = 0; index < entriesToSnapshot; index += 1) {
        const key = keys[index];
        if (key === undefined) {
          continue;
        }

        if (
          /password|passwd|secret|token|authorization|cookie|credential|credentials|api[-_.]?key|private[-_.]?key|publishable[-_.]?key|^ticket$/i.test(
            key,
          )
        ) {
          entries.push([key, '[Redacted]']);
          continue;
        }

        const descriptor = descriptors[key];
        if (descriptor === undefined) {
          entries.push([key, '[Unavailable Property]']);
          continue;
        }

        if ('value' in descriptor) {
          entries.push([
            key,
            snapshotValue(
              descriptor.value,
              depth + 1,
              visitedValues,
              objectsInCurrentPath,
            ),
          ]);
          continue;
        }

        entries.push([key, '[Accessor Property]']);
      }

      if (keys.length > 50) {
        entries.push([
          '[truncated entries]',
          `[${keys.length - 49} entries truncated]`,
        ]);
      }

      // Workerd RPC requires ordinary object prototypes. fromEntries also keeps
      // an authored __proto__ key as own data without invoking its setter.
      return Object.fromEntries<unknown>(entries);
    } finally {
      objectsInCurrentPath.delete(value);
    }
  };

  return Effect.gen(function* () {
    // 7. Snapshot defects are converted to data. Argument inspection therefore
    // cannot prevent the wrapped function from starting or change its outcome.
    const argumentSnapshot = yield* Effect.sync(() => {
      try {
        return snapshotValue(args, 0, { count: 0 }, new WeakSet());
      } catch {
        return '[Snapshot Unavailable]';
      }
    });
    yield* Effect.annotateCurrentSpan('function.arguments', argumentSnapshot);

    // 8. The finalizer sees every exit and is uninterruptible. It observes the
    // original Cause without converting failures, defects, or interruptions.
    return yield* Effect.onExit(effect, exit =>
      Effect.gen(function* () {
        const snapshot = yield* Effect.sync(() => {
          try {
            let value: unknown;
            if (Exit.isSuccess(exit)) {
              value = exit.value;
            } else {
              const reasons = exit.cause.reasons;
              // Bound reason enumeration before constructing their snapshot
              // inputs; a large Cause must not trigger an unbounded map first.
              const entries: unknown[] = reasons
                .slice(0, reasons.length > 50 ? 49 : 50)
                .map(reason => {
                  if (Cause.isFailReason(reason)) {
                    return { _tag: 'Fail', error: reason.error };
                  }
                  if (Cause.isDieReason(reason)) {
                    return { _tag: 'Die', defect: reason.defect };
                  }
                  return { _tag: 'Interrupt', fiberId: reason.fiberId };
                });
              if (reasons.length > 50) {
                entries.push(`[${reasons.length - 49} entries truncated]`);
              }
              value = entries;
            }
            return snapshotValue(value, 0, { count: 0 }, new WeakSet());
          } catch {
            return '[Snapshot Unavailable]';
          }
        });
        if (Exit.isSuccess(exit)) {
          yield* Effect.annotateCurrentSpan('function.result', snapshot);
          yield* Effect.annotateCurrentSpan('function.exit', {
            _tag: 'Success',
          });
        } else {
          yield* Effect.annotateCurrentSpan('function.exit', {
            _tag: 'Failure',
            reasons: snapshot,
          });
        }
      }),
    );
  });
};
