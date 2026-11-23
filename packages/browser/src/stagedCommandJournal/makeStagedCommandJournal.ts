import { isZerospinError, makeZerospinError } from '@zerospin/error';

type IJournalCommand = {
  sessionId: string;
  sessionIndex: number;
  id: string | null;
  nodeId: string | null;
  nodeIndex: number | null;
  pushIndex: number | null;
};

export type IStagedCommandJournal<COMMAND> = {
  readonly key: string;
  write(command: COMMAND): void;
  read(): readonly COMMAND[];
  readForUpgrade(): readonly COMMAND[];
  remove(command: { sessionId: string; sessionIndex: number }): void;
};

/** A failed browser write leaves ordinary in-memory staging and handoff unchanged. */
export function makeStagedCommandJournal<
  COMMAND extends IJournalCommand,
>(props: {
  prefix: string;
  identityKey: string;
  nodeId: string;
  decode(command: unknown): COMMAND;
}): IStagedCommandJournal<COMMAND> {
  const { prefix, identityKey, nodeId, decode } = props;
  const key = `${prefix}:${encodeURIComponent(identityKey)}:${encodeURIComponent(nodeId)}:`;
  const commandKey = (command: { sessionId: string; sessionIndex: number }) =>
    `${key}${encodeURIComponent(command.sessionId)}:${command.sessionIndex}`;
  const isOriginal = (command: COMMAND) =>
    command.id === null &&
    command.nodeId === null &&
    command.nodeIndex === null &&
    command.pushIndex === null;

  const byOriginalPosition = (left: COMMAND, right: COMMAND) =>
    left.sessionId.localeCompare(right.sessionId) ||
    left.sessionIndex - right.sessionIndex;

  return {
    key,
    write(command) {
      try {
        const original = decode(command);
        if (!isOriginal(original)) return;
        const entryKey = commandKey(original);
        const storage = globalThis.localStorage;
        if (storage.getItem(entryKey) !== null) return;
        storage.setItem(entryKey, JSON.stringify(original));
      } catch {
        // Storage policy, quota, serialization and access failures are best effort.
      }
    },
    read() {
      const keys = new Set<string>();
      try {
        const storage = globalThis.localStorage;
        const length = storage.length;
        for (let index = 0; index < length; index += 1) {
          const entryKey = storage.key(index);
          if (entryKey?.startsWith(key)) keys.add(entryKey);
        }
      } catch {
        return [];
      }
      const commands: COMMAND[] = [];
      for (const entryKey of keys) {
        try {
          const serialized = globalThis.localStorage.getItem(entryKey);
          if (serialized === null) continue;
          const command = decode(JSON.parse(serialized));
          if (isOriginal(command) && commandKey(command) === entryKey) {
            commands.push(command);
          }
        } catch {
          // One malformed or inaccessible entry cannot suppress other commands.
        }
      }
      return commands.sort(byOriginalPosition);
    },
    readForUpgrade() {
      try {
        const storage = globalThis.localStorage;
        const entries = new Map<string, string>();
        const length = storage.length;
        for (let index = 0; index < length; index += 1) {
          const entryKey = storage.key(index);
          if (!entryKey?.startsWith(key)) continue;
          const serialized = storage.getItem(entryKey);
          if (serialized === null || entries.has(entryKey)) {
            throw makeZerospinError('node-storage-upgrade-journal-invalid');
          }
          entries.set(entryKey, serialized);
        }
        // Capture values before acknowledging anything: deletion must not shift pages.
        const commands: COMMAND[] = [];
        for (const [entryKey, serialized] of entries) {
          const command = decode(JSON.parse(serialized));
          if (!isOriginal(command) || commandKey(command) !== entryKey) {
            throw makeZerospinError('node-storage-upgrade-journal-invalid');
          }
          commands.push(command);
        }
        return commands.sort(byOriginalPosition);
      } catch (error) {
        if (
          isZerospinError(error) &&
          error.code === 'node-storage-upgrade-predecessor-pending'
        ) {
          throw error;
        }
        throw makeZerospinError({
          code: 'node-storage-upgrade-journal-invalid',
          message:
            'Persisted commands could not be read safely. Their local journal has been preserved.',
        });
      }
    },
    remove(command) {
      try {
        globalThis.localStorage.removeItem(commandKey(command));
      } catch {
        // Exact Node deduplication permits retry after a failed deletion.
      }
    },
  };
}
