import { randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import {
  link,
  lstat,
  open,
  readFile,
  rename,
  stat,
  unlink,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { TextDecoder } from 'node:util';

import { makeZerospinError, prettyUnknownFailure } from '@zerospin/error';
import * as Effect from 'effect/Effect';

const startMarker = '<!-- zerospin:agent-rules:start -->';
const endMarker = '<!-- zerospin:agent-rules:end -->';

interface IAgentsMdSnapshot {
  bytes: Buffer;
  stat: Stats;
}

function findRuleRegion(document: string, filePath: string) {
  const starts = document.split(startMarker).length - 1;
  const ends = document.split(endMarker).length - 1;
  if (starts === 0 && ends === 0) return null;

  const start = document.indexOf(startMarker);
  const end = document.indexOf(endMarker);
  const isStandalone = (offset: number, marker: string) => {
    const after = document.slice(offset + marker.length);
    return (
      (offset === 0 || document[offset - 1] === '\n') &&
      (after === '' || after.startsWith('\n') || after.startsWith('\r\n'))
    );
  };
  if (
    starts !== 1 ||
    ends !== 1 ||
    end < start ||
    !isStandalone(start, startMarker) ||
    !isStandalone(end, endMarker)
  ) {
    throw new Error(
      `Malformed Zerospin rule markers in ${filePath}. Keep exactly one complete, ordered pair on standalone lines; no file was changed.`,
    );
  }
  return { start, end: end + endMarker.length };
}

function decodeDocument(bytes: Buffer) {
  // Reject invalid UTF-8 rather than replacing bytes outside the managed block.
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
    bytes,
  );
}

async function readAgentsMd(
  filePath: string,
): Promise<IAgentsMdSnapshot | null> {
  const existing = await lstat(filePath).catch((cause: unknown) => {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
      return null;
    }
    throw cause;
  });
  if (!existing) return null;
  if (!existing.isFile()) {
    throw new Error(
      `AGENTS.md must be a regular file, not a symlink or directory: ${filePath}.`,
    );
  }
  const file = await open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  ).catch((cause: unknown) => {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
      return null;
    }
    throw cause;
  });
  if (!file) return null;
  try {
    const stat = await file.stat();
    if (!stat.isFile()) {
      throw new Error(`AGENTS.md must be a regular file: ${filePath}.`);
    }
    return { bytes: await file.readFile(), stat };
  } finally {
    await file.close();
  }
}

async function writeAgentsMd(props: {
  filePath: string;
  original: IAgentsMdSnapshot | null;
  document: string;
}) {
  const { filePath, original, document } = props;
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  const file = await open(temporaryPath, 'wx', 0o600);
  try {
    try {
      await file.writeFile(document, 'utf8');
      if (original) await file.chmod(original.stat.mode & 0o7777);
    } finally {
      await file.close();
    }
    const current = await readAgentsMd(filePath);
    const unchanged =
      original === null
        ? current === null
        : current !== null &&
          original.stat.dev === current.stat.dev &&
          original.stat.ino === current.stat.ino &&
          original.stat.mode === current.stat.mode &&
          original.stat.mtimeMs === current.stat.mtimeMs &&
          original.stat.ctimeMs === current.stat.ctimeMs &&
          original.bytes.equals(current.bytes);
    if (!unchanged) {
      throw new Error(
        `AGENTS.md changed while configuring ${filePath}. Review it and retry.`,
      );
    }
    if (original) {
      await rename(temporaryPath, filePath);
    } else {
      // Exclusive creation must not overwrite a document created after our read.
      await link(temporaryPath, filePath);
    }
  } finally {
    await unlink(temporaryPath).catch((cause: unknown) => {
      if (
        !(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')
      ) {
        throw cause;
      }
    });
  }
}

/** Install or check the SDK's literal rule without loading application configuration. */
export const configureAgentsMdFn = Effect.fn('configureAgentsMdFn')((props: {
  directory?: string;
  check?: boolean;
  dryRun?: boolean;
}) => {
  const { directory = process.cwd(), check = false, dryRun = false } = props;
  return Effect.tryPromise({
    try: async () => {
      if (check && dryRun) {
        throw new Error('Use either --check or --dry-run, not both.');
      }
      const directoryPath = resolve(directory);
      if (!(await stat(directoryPath)).isDirectory()) {
        throw new Error(`Not a directory: ${directoryPath}.`);
      }
      const filePath = resolve(directoryPath, 'AGENTS.md');
      const sourcePath = createRequire(import.meta.url).resolve(
        '@zerospin/sdk/agent-rules',
      );
      const source = decodeDocument(await readFile(sourcePath)).replaceAll(
        '\r\n',
        '\n',
      );
      const sourceRegion = findRuleRegion(source, sourcePath);
      if (!sourceRegion) {
        throw new Error(`Missing Zerospin rule markers in ${sourcePath}.`);
      }
      const policy = source
        .slice(
          sourceRegion.start + startMarker.length,
          sourceRegion.end - endMarker.length,
        )
        .trim();
      if (!policy) throw new Error(`Empty Zerospin rule in ${sourcePath}.`);

      const original = await readAgentsMd(filePath);
      const before = original ? decodeDocument(original.bytes) : '';
      const region = findRuleRegion(before, filePath);
      const eol = before.match(/\r?\n/)?.[0] ?? '\n';
      const block = `${startMarker}${eol}${eol}${policy.replaceAll('\n', eol)}${eol}${eol}${endMarker}`;
      const separator =
        before === '' || before.endsWith(eol + eol)
          ? ''
          : before.endsWith(eol)
            ? eol
            : eol + eol;
      const after = region
        ? before.slice(0, region.start) + block + before.slice(region.end)
        : before + separator + block + eol;
      const status =
        before === after ? 'current' : original ? 'updated' : 'created';
      if (check && status !== 'current') {
        throw new Error(
          `Zerospin rules are ${original ? 'stale or missing' : 'missing'} in ${filePath}. Run zerospin configure-agents-md --directory ${JSON.stringify(resolve(directory))} to refresh them.`,
        );
      }
      if (status !== 'current' && !check && !dryRun) {
        await writeAgentsMd({ filePath, original, document: after });
      }
      return {
        filePath,
        status,
        preview:
          dryRun && status !== 'current'
            ? `--- ${filePath} (before)\n${before}\n+++ ${filePath} (after)\n${after}`
            : null,
      };
    },
    catch: cause =>
      makeZerospinError({
        code: 'configure-agents-md-failed',
        message:
          cause instanceof Error
            ? cause.message
            : 'Failed to configure AGENTS.md.',
        cause: prettyUnknownFailure(cause),
      }),
  });
});
