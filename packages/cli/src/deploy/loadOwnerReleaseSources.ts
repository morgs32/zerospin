import { realpath } from 'node:fs/promises';
import nodePath from 'node:path';

import type { IAnyAggregateRelease } from '@zerospin/core/aggregate/types';
import { makeReleaseSpec } from '@zerospin/core/declaration/makeReleaseSpec';
import type { IAnyServiceRelease } from '@zerospin/core/service/types';
import type { IOwnerRelease } from '@zerospin/core/system/ownerReleaseDeployment';
import type { ISystem } from '@zerospin/core/system/types';
import { makeZerospinError, prettyUnknownFailure } from '@zerospin/error';
import * as Schema from 'effect/Schema';

const decodeSource = Schema.decodeUnknownSync(
  Schema.Struct({
    module: Schema.String.check(Schema.isPattern(/^\.{1,2}\//)),
    export: Schema.NonEmptyString.check(
      Schema.makeFilter(name => name !== 'default'),
    ),
  }),
);

export interface IOwnerReleaseSource {
  modulePath: string;
  exportName: string;
}

export interface ILoadedOwnerRelease {
  release: IOwnerRelease;
  releaseSpec: ReturnType<typeof makeReleaseSpec>;
  source: IOwnerReleaseSource;
}

function ownExport(value: unknown, name: string | number): unknown {
  return typeof value === 'object' &&
    value !== null &&
    Object.hasOwn(value, name)
    ? Reflect.get(value, name)
    : undefined;
}

/** Compare native release objects within the same graph that evaluated makeSystem. */
export async function loadOwnerReleaseSources(props: {
  system: ISystem;
  declarations: unknown;
  configPath: string;
  resolveModule: (modulePath: string) => string;
  loadModule: (modulePath: string) => Promise<unknown>;
}): Promise<ILoadedOwnerRelease[]> {
  const { system, declarations, configPath, resolveModule, loadModule } = props;
  const families = [
    { name: 'aggregates', owners: system.aggregates },
    { name: 'services', owners: system.services },
  ] as const;
  const configModulePath = await realpath(configPath);
  const releases: ILoadedOwnerRelease[] = [];
  for (const { name: family, owners } of families) {
    const sources = ownExport(declarations, family);
    for (const { releases: registered } of Object.values(owners)) {
      for (const release of Object.values<
        IAnyAggregateRelease | IAnyServiceRelease
      >(registered)) {
        const { name, version } = release;
        const identity = `${family}.${name}[${version}]`;
        const declaration = ownExport(ownExport(sources, name), version);
        if (declaration === undefined) {
          throw makeZerospinError({
            code: 'zerospin-owner-release-source-missing',
            message: `Missing ownerReleaseSources.${identity} in ${configPath}.`,
          });
        }
        let modulePath: string;
        let exportName: string;
        let loaded: unknown;
        try {
          const source = decodeSource(declaration, {
            onExcessProperty: 'error',
          });
          modulePath = await realpath(
            resolveModule(
              nodePath.resolve(nodePath.dirname(configPath), source.module),
            ),
          );
          if (modulePath === configModulePath) {
            throw new Error(
              'An owner release source must live outside zerospin.config.ts.',
            );
          }
          exportName = source.export;
          loaded = await loadModule(modulePath);
        } catch (cause) {
          throw makeZerospinError({
            code: 'zerospin-owner-release-source-invalid',
            message: `Could not load ownerReleaseSources.${identity} from ${configPath}.`,
            cause: prettyUnknownFailure(cause),
          });
        }
        const exported = ownExport(loaded, exportName);
        if (exported === undefined) {
          throw makeZerospinError({
            code: 'zerospin-owner-release-export-missing',
            message: `${modulePath} does not export ${JSON.stringify(exportName)} for ownerReleaseSources.${identity}.`,
          });
        }
        if (exported !== release) {
          throw makeZerospinError({
            code: 'zerospin-owner-release-source-mismatched',
            message: `Export ${JSON.stringify(exportName)} from ${modulePath} is not the registered release at ownerReleaseSources.${identity}.`,
          });
        }
        releases.push({
          release:
            family === 'aggregates'
              ? { aggregateName: name, aggregateVersion: version }
              : { serviceName: name, serviceVersion: version },
          releaseSpec: makeReleaseSpec(release),
          source: { modulePath, exportName },
        });
      }
    }
  }
  return releases;
}
