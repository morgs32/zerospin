import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { getOwnerReleaseBindingName } from '@zerospin/core/system/ownerReleaseDeployment';
import { build } from 'esbuild';
import { expect, it } from 'vitest';

import type { ILoadedOwnerRelease } from '../dist/deploy/loadOwnerReleaseSources.js';
import type { prepareOwnerReleaseWranglerConfig } from '../dist/deploy/utils/writeOwnerReleaseEntrypoint.js';

const fixture = new URL('./fixtures/same-release/', import.meta.url);
const resolveDir = fileURLToPath(fixture);
const wrangler = createRequire(import.meta.url).resolve('wrangler');
const { Miniflare, convertV4MiniflareOptions } =
  createRequire(wrangler)('miniflare');
const systemId = 'sys_patch';
const service = { serviceName: 'reservations', serviceVersion: 1 };
const inventory = { serviceName: 'inventory', serviceVersion: 1 };
const customerUrl = 'https://customer.invalid/systems/sys_patch/ins_patch';
const headers = { Authorization: 'Bearer customer-fixture' };
const common = {
  modules: true,
  compatibilityDate: '2026-10-19',
  compatibilityFlags: ['nodejs_compat'],
};

async function bundle(
  contents: string,
  modules: Readonly<Record<string, string>> = {},
) {
  const result = await build({
    stdin: { contents, loader: 'js', resolveDir },
    write: false,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    conditions: ['workerd', 'worker'],
    external: ['node:*', 'cloudflare:*'],
    plugins: [
      {
        name: 'retained-customer-artifacts',
        setup(builder) {
          builder.onResolve(
            {
              filter: /^(original-artifact|patched-artifact|retained-builds)$/,
            },
            args => ({ path: args.path, namespace: 'release-input' }),
          );
          builder.onLoad({ filter: /.*/, namespace: 'release-input' }, args => {
            const contents = modules[args.path];
            if (contents === undefined)
              throw new Error('Missing artifact ' + args.path);
            return { contents, loader: 'js', resolveDir };
          });
        },
      },
    ],
  });
  return result.outputFiles[0]!.text;
}

it('compares the registered Node export with the declaration loaded by each packaged owner', async () => {
  const directory = await mkdtemp(join(resolveDir, '.declarations-'));
  const configPath = join(directory, 'zerospin.config.ts');
  const require = createRequire(import.meta.url);
  try {
    await writeFile(
      join(directory, 'checkout.mjs'),
      `
      import * as sdk from '@zerospin/sdk';
      export const checkout = sdk.makeAggregateRelease(sdk.defineAggregate({ name: 'checkout' }), { version: 1, actors: {}, models: {} });
    `,
    );
    await writeFile(
      join(directory, 'reservations.mjs'),
      `
      import * as sdk from '@zerospin/sdk';
      const reservation = sdk.makeModelVersion(sdk.defineModel({ name: 'reservation', abbreviation: 'rsv' }), {
        version: 1, attributes: {
          bookedBy: sdk.primitives.text(),
          ...(typeof WebSocketPair === 'function' ? { venue: sdk.primitives.text() } : {}),
        }, indexes: [],
      });
      export const reservations = sdk.makeServiceRelease(sdk.defineService({ name: 'reservations' }), {
        version: 1, models: { reservation },
      });
    `,
    );
    await writeFile(
      configPath,
      `
      import * as sdk from '@zerospin/sdk';
      import { checkout } from './checkout.mjs';
      import { reservations } from './reservations.mjs';
      export const ownerReleaseSources = {
        aggregates: { checkout: { 1: { module: './checkout.mjs', export: 'checkout' } } },
        services: { reservations: { 1: { module: './reservations.mjs', export: 'reservations' } } },
      };
      export default sdk.makeConfig({ systemId: 'sys_comparison', system: sdk.makeSystem({
        name: 'comparison', aggregates: { checkout: { releases: { 1: checkout } } },
        services: { reservations: { releases: { 1: reservations }, canonical: 1 } },
      }) });
    `,
    );
    // Run the ordinary CLI module loader in Node, outside Vitest's module graph.
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
      import * as NodePath from '@effect/platform-node-shared/NodePath';
      import * as Effect from 'effect/Effect';
      import * as Layer from 'effect/Layer';
      import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
      import { makeWranglerConfig } from '@zerospin/dev-worker/makeWranglerConfig';
      import { loadZerospinProject } from ${JSON.stringify(new URL('../dist/deploy/loadZerospinConfigFn.js', import.meta.url).href)};
      import { prepareOwnerReleaseWranglerConfig } from ${JSON.stringify(new URL('../dist/deploy/utils/writeOwnerReleaseEntrypoint.js', import.meta.url).href)};
      const { config, ownerReleases } = await Effect.runPromise(
        loadZerospinProject({ cwd: process.cwd(), resolveOwnerReleases: true }).pipe(Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))),
      );
      const systemSpec = makeSystemSpec({ system: config.system });
      const stable = makeWranglerConfig({ config, configModulePath: ${JSON.stringify(configPath)}, main: 'stable.js', environment: 'production' });
      stable.vars.ZEROSPIN_SYSTEM_SPEC_HASH = systemSpec.hash;
      const workers = await Promise.all(ownerReleases.map(async loaded => ({
        loaded,
        worker: await prepareOwnerReleaseWranglerConfig({
          ...loaded, config, directory: process.cwd(), stable,
          frameworkMain: 'aggregateName' in loaded.release
            ? ${JSON.stringify(require.resolve('@zerospin/owner-release-worker/AggregateReleaseWorker'))}
            : ${JSON.stringify(require.resolve('@zerospin/owner-release-worker/ServiceReleaseWorker'))},
        }),
      })));
      console.log(JSON.stringify({ systemId: config.systemId, systemSpec, workers }));
    `,
      ],
      { cwd: directory },
    );
    const {
      systemId,
      systemSpec,
      workers,
    }: {
      systemId: string;
      systemSpec: { hash: string };
      workers: {
        loaded: ILoadedOwnerRelease;
        worker: Awaited<ReturnType<typeof prepareOwnerReleaseWranglerConfig>>;
      }[];
    } = JSON.parse(stdout);
    expect(workers.map(({ loaded }) => loaded.release)).toEqual([
      { aggregateName: 'checkout', aggregateVersion: 1 },
      { serviceName: 'reservations', serviceVersion: 1 },
    ]);
    for (const { loaded, worker } of workers) {
      const aggregate = 'aggregateName' in loaded.release;
      const { outputFiles } = await build({
        entryPoints: [worker.main],
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        conditions: ['workerd', 'worker'],
        external: ['cloudflare:*', 'node:*'],
      });
      const script = outputFiles[0]!.text;
      expect(script).not.toContain(systemSpec.hash);
      expect(script).not.toContain(JSON.stringify(systemSpec));
      expect(script).not.toContain(JSON.stringify(JSON.stringify(systemSpec)));
      expect(script).not.toContain(JSON.stringify(loaded.releaseSpec));
      expect(script).not.toContain(
        JSON.stringify(JSON.stringify(loaded.releaseSpec)),
      );
      const flare = new Miniflare(
        convertV4MiniflareOptions({
          workers: [
            {
              ...common,
              name: 'probe',
              script:
                'export default { async fetch(request, env) { return Response.json(await env.OWNER.getOwnerReleaseDeclaration()); } }',
              serviceBindings: { OWNER: worker.name },
            },
            {
              ...common,
              name: worker.name,
              script,
              bindings: {
                ...worker.vars,
                ZEROSPIN_VERSION_METADATA: { id: 'new-build' },
              },
            },
          ],
        }),
      );
      try {
        const result = await (
          await flare.dispatchFetch('https://probe.invalid')
        ).json();
        expect(result.identity).toEqual({
          systemId,
          release: loaded.release,
          specHash: systemSpec.hash,
          versionId: 'new-build',
        });
        if (aggregate) {
          expect(result.releaseSpec).toEqual(loaded.releaseSpec);
        } else {
          expect(JSON.stringify(loaded.releaseSpec)).not.toContain('"venue"');
          expect(JSON.stringify(result.releaseSpec)).toContain('"venue"');
          expect(result.releaseSpec).not.toEqual(loaded.releaseSpec);
        }
      } finally {
        await flare.dispose();
      }
    }
    expect(
      (await readdir(directory)).filter(file => file.endsWith('.txt')),
    ).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);

it('retains a live Service build for in-flight work while queued work starts on its accepted patch', async () => {
  // Keep the exact bytes for each authored build. The second bundle embeds the original artifact again.
  const source = await readFile(new URL('bookings.mjs', fixture), 'utf8');
  const artifacts = await Promise.all(
    [false, true].map(async patched => {
      const { outputFiles } = await build({
        stdin: { contents: source, resolveDir },
        write: false,
        bundle: true,
        packages: 'external',
        format: 'esm',
        target: 'es2022',
        minifySyntax: true,
        define: { PATCHED: String(patched) },
        external: ['cloudflare:*'],
      });
      const code = outputFiles[0]!.text;
      return { code, id: createHash('sha256').update(code).digest('hex') };
    }),
  );
  const first = artifacts[0]!;
  const second = artifacts[1]!;
  expect(first.id).not.toBe(second.id);
  const baseline = { 'original-artifact': first.code };
  const specSource = await bundle(
    `
    import * as sdk from '@zerospin/sdk';
    import { inventory, reservations, reservation, hold } from 'original-artifact';
    const spec = sdk.makeSystemSpec({ system: sdk.makeSystem({
      name: 'compatiblePatch', aggregates: {}, services: {
        reservations: { releases: { 1: reservations }, canonical: 1 },
        inventory: { releases: { 1: inventory }, canonical: 1 },
      },
    }) });
    export default { fetch() { return Response.json({ spec,
      reservationTable: reservation.table.name, holdTable: hold.table.name,
    }); } };
  `,
    baseline,
  );
  const compiler = new Miniflare(
    convertV4MiniflareOptions({
      workers: [{ ...common, name: 'spec', script: specSource }],
    }),
  );
  const definitions = await (async () => {
    try {
      return await (
        await compiler.dispatchFetch('https://build.invalid')
      ).json();
    } finally {
      await compiler.dispose();
    }
  })();
  const { spec, reservationTable, holdTable } = definitions;
  const ownerSource = await readFile(new URL('owner.mjs', fixture), 'utf8');
  const original = await bundle(ownerSource, {
    ...baseline,
    'retained-builds': `import { reservations } from 'original-artifact'; export const retained = { "${first.id}": reservations };`,
  });
  const patched = await bundle(ownerSource, {
    ...baseline,
    'patched-artifact': second.code,
    'retained-builds': `
      import { reservations as first } from 'original-artifact';
      import { reservations as second } from 'patched-artifact';
      export const retained = { "${first.id}": first, "${second.id}": second };
    `,
  });
  expect(original).not.toContain(second.id);
  const pins = [service, inventory].map(release => ({
    systemId,
    release,
    versionId: release.serviceName + '-upload-1',
    specHash: spec.hash,
  }));
  const physical = { systemId, specHash: spec.hash };
  const root = {
    SYSTEM_REPO: { className: 'SystemRepo', useSQLite: true },
    SERVICE_CHAIN: { className: 'ServiceChain', useSQLite: true },
  };
  const storage = await mkdtemp(
    join(await realpath(tmpdir()), 'zerospin-compatible-patch-'),
  );
  let startThrough = 1;
  let holdReplies = true;
  let dropAck = true;
  let lostAcks = 0;
  let heldReplies = 0;
  const faults = (request: Request) => {
    const path = new URL(request.url).pathname;
    if (path === '/ack' && dropAck) {
      lostAcks++;
      return new Response(null, { status: 503 });
    }
    if (path === '/map' && holdReplies) {
      heldReplies++;
      return new Response(null, { status: 503 });
    }
    if (path.startsWith('/start/') && Number(path.slice(7)) > startThrough)
      return new Response(null, { status: 503 });
    return new Response(null, { status: 204 });
  };
  const stable = {
    ...common,
    name: 'stable',
    script: await bundle(
      await readFile(new URL('stable.mjs', fixture), 'utf8'),
    ),
    durableObjects: root,
    bindings: {
      ZEROSPIN_SYSTEM_ID: systemId,
      ZEROSPIN_SYSTEM_NAME: spec.systemName,
      ZEROSPIN_SYSTEM_SPEC_HASH: spec.hash,
      ZEROSPIN_STORAGE_LAYOUT: 'release-owned-v1',
      ZEROSPIN_VERSION_METADATA: { id: 'stable' },
      ZEROSPIN_HOSTED_SERVICE_BUILDS: true,
      SNAPSHOT: { spec, ownerReleases: pins },
      RESERVATION_TABLE: reservationTable,
    },
    serviceBindings: {
      FAULTS: faults,
      RESERVATIONS: 'reservations',
      [getOwnerReleaseBindingName(service)]: 'reservations',
      [getOwnerReleaseBindingName(inventory)]: 'inventory',
    },
  };
  const owners = pins.map(pin => ({
    ...common,
    name: pin.release.serviceName,
    script: original,
    durableObjects: {
      SERVICE_VERSION_REPO: {
        className: 'ServiceVersionRepo',
        useSQLite: true,
      },
      SERVICE_VERSION_CHAIN: {
        className: 'ServiceVersionChain',
        useSQLite: true,
      },
      SERVICE_VERSION_ARCHIVE: {
        className: 'ServiceVersionArchive',
        useSQLite: true,
      },
    },
    bindings: {
      ZEROSPIN_SYSTEM_ID: systemId,
      ZEROSPIN_OWNER_RELEASE: pin.release,
      ZEROSPIN_VERSION_METADATA: { id: pin.versionId },
      ZEROSPIN_STORAGE_LAYOUT: 'release-owned-v1',
      ZEROSPIN_SYSTEM_NAME: spec.systemName,
      ZEROSPIN_SYSTEM_SPEC_HASH: spec.hash,
      FAIL_BOOKING: true,
    },
    serviceBindings: {
      FAULTS: faults,
      ZEROSPIN_HOSTED_RELEASE_RPC: {
        name: 'stable',
        entrypoint: 'ReservationReplay',
        props: { systemId, ...pin.release, writable: true },
      },
      ...(pin.release.serviceName === 'reservations'
        ? {
            ZEROSPIN_SERVICE_EXECUTION: {
              name: 'stable',
              entrypoint: 'ReservationExecution',
            },
          }
        : {}),
    },
  }));
  const options = () =>
    convertV4MiniflareOptions({
      resourcePersistencePath: storage,
      workers: [stable, ...owners],
    });
  let flare = new Miniflare(options());
  const bindings = () => flare.getBindings('stable');
  const catalog = async () =>
    (await bindings()).SYSTEM_REPO.getByName(systemId);
  const chain = async (name = 'reservations') =>
    (await bindings()).SERVICE_CHAIN.getByName('sc_' + systemId + '/' + name);
  const repo = async (name: string) =>
    (await flare.getBindings(name)).SERVICE_VERSION_REPO.getByName(
      'svr_' + systemId + '/' + name + '/1',
    );
  const probe = async () =>
    (await bindings()).RESERVATIONS.getOwnerReleaseDeclaration();
  const assignment = async (serviceIndex: number) =>
    (
      await (
        await catalog()
      ).getServiceExecutionBuild({ ...service, serviceIndex })
    ).result.success;
  const admit = async (id: string) => {
    const response = await flare.dispatchFetch(customerUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reservationId: id, checkIn: 1000, nights: 2 }),
    });
    const admission = await response.json();
    expect(admission).toMatchObject({ _tag: 'Success' });
    return admission.success.serviceIndex;
  };
  const rows = async () =>
    (await (await flare.dispatchFetch(customerUrl, { headers })).json()).success
      .rows;
  const holds = async () =>
    (await (await repo('inventory')).getRepoTableRows({ tableName: holdTable }))
      .result.success.rows;
  const poll = { timeout: 15000, interval: 100 };

  try {
    const { identity: one, releaseSpec: originalDeclaration } = await probe();
    const retiredRoute = await (
      await bindings()
    ).RESERVATIONS.fetch('https://executor.invalid/__zerospin/owner-release');
    expect(retiredRoute.status).toBe(404);
    expect(one).toEqual({
      ...physical,
      release: service,
      versionId: pins[0]!.versionId,
    });
    expect(
      (
        await (
          await catalog()
        ).registerSystemSpec({ spec, ownerReleases: pins })
      ).result._tag,
    ).toBe('Success');
    expect(
      (
        await (
          await catalog()
        ).acceptServiceBuild({
          ...service,
          specHash: spec.hash,
          buildId: first.id,
          previousBuildId: null,
        })
      ).result.success,
    ).toBe(first.id);
    expect(await admit('rsv_alice')).toBe(1);
    await expect.poll(holds, poll).toHaveLength(1);
    await expect.poll(() => heldReplies, poll).toBeGreaterThan(0);
    expect(await rows()).toEqual([
      expect.objectContaining({
        id: 'rsv_alice',
        expiresAt: 7201000,
        bookedBy: 'original',
        mappedBy: 'pending',
      }),
    ]);
    // One ordered Chain. Admit the staging write ahead of Bob so it can start first.
    expect(await admit('rsv_staging')).toBe(2);
    expect(await admit('rsv_rollback')).toBe(3);
    expect(await admit('rsv_bob')).toBe(4);
    expect(await assignment(4)).toBeNull();
    const ns = (await flare.getBindings('reservations')).SERVICE_VERSION_REPO;
    const repoId = (
      await ns.idFromName('svr_sys_patch/reservations/1')
    ).toString();

    owners[0]!.script = patched;
    owners[0]!.bindings.ZEROSPIN_VERSION_METADATA = {
      id: 'reservations-upload-2',
    };
    await flare.setOptions(options());
    const { identity: two, releaseSpec: patchedDeclaration } = await probe();
    expect(patchedDeclaration).toEqual(originalDeclaration);
    expect(two).toEqual({
      ...physical,
      release: service,
      versionId: 'reservations-upload-2',
    });
    expect(
      (
        await (
          await flare.getBindings('reservations')
        ).SERVICE_VERSION_REPO.idFromName('svr_sys_patch/reservations/1')
      ).toString(),
    ).toBe(repoId);
    expect(await rows()).toHaveLength(1);
    startThrough = 3;
    await (await chain()).executeCommandsThrough(2);
    await expect.poll(rows, poll).toContainEqual(
      expect.objectContaining({
        id: 'rsv_staging',
        expiresAt: 7201000,
        bookedBy: 'original',
      }),
    );
    const failed = await (await chain()).executeCommandsThrough(3);
    expect(failed.result._tag).toBe('Failure');
    expect(await assignment(3)).toBe(first.id);
    expect(await rows()).toHaveLength(2);
    expect(await assignment(4)).toBeNull();

    const publish = {
      ...service,
      specHash: two.specHash,
      buildId: second.id,
      previousBuildId: first.id,
    };
    expect(
      (await (await catalog()).acceptServiceBuild(publish)).result.success,
    ).toBe(second.id);
    expect(
      (await (await catalog()).acceptServiceBuild(publish)).result.success,
    ).toBe(second.id);
    await flare.dispose();
    owners[0]!.bindings.FAIL_BOOKING = false;
    startThrough = Number.MAX_SAFE_INTEGER;
    flare = new Miniflare(options());
    // Owner history publishes independently of the lost Chain acknowledgement.
    await expect.poll(() => lostAcks, poll).toBeGreaterThan(0);
    const history = (
      await flare.getBindings('reservations')
    ).SERVICE_VERSION_CHAIN.getByName('svc_sys_patch/reservations/1');
    const committed = async () =>
      (await history.getEvaluatedCommand({ serviceIndex: 4 })).result;
    await expect
      .poll(committed, poll)
      .toMatchObject({ _tag: 'Success', success: { serviceIndex: 4 } });
    const bob = await committed();
    expect(bob).toMatchObject({
      _tag: 'Success',
      success: { serviceIndex: 4, outcome: { result: { _tag: 'Success' } } },
    });
    expect(
      (await (await chain()).getServiceCommand({ serviceIndex: 4 })).result,
    ).toMatchObject({
      _tag: 'Success',
      success: { id: bob.success.id, outcome: null },
    });
    expect(await assignment(4)).toBe(second.id);
    expect(await rows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'rsv_rollback',
          bookedBy: 'original',
          expiresAt: 7201000,
        }),
        expect.objectContaining({
          id: 'rsv_bob',
          bookedBy: 'corrected',
          expiresAt: 172801000,
        }),
      ]),
    );

    await flare.dispose();
    dropAck = false;
    holdReplies = false;
    flare = new Miniflare(options());
    const source = await chain();
    expect((await source.executeCommandsThrough(4)).result._tag).toBe(
      'Success',
    );
    expect(
      (await source.getServiceCommand({ serviceIndex: 4 })).result,
    ).toMatchObject({
      _tag: 'Success',
      success: { id: bob.success.id, outcome: bob.success.outcome },
    });
    expect(
      (
        await (
          await repo('reservations')
        ).awaitCommandResult({ serviceIndex: 4 })
      ).result,
    ).toEqual(bob);
    await expect.poll(rows, poll).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'rsv_alice',
          bookedBy: 'original',
          mappedBy: 'original',
        }),
        expect.objectContaining({
          id: 'rsv_bob',
          bookedBy: 'corrected',
          mappedBy: 'corrected',
        }),
      ]),
    );
    expect(await rows()).toHaveLength(4);
    expect(await holds()).toHaveLength(2);
    const writable = await flare.getBindings('reservations');
    expect(writable.SYSTEM_REPO).toBeUndefined();
    expect(writable.SERVICE_CHAIN).toBeUndefined();
    const archiveRegistrations = await (
      await catalog()
    ).getRepoRegistrations({
      repoType: 'ServiceVersionArchive',
    });
    expect(archiveRegistrations.result.success).toContainEqual(
      expect.objectContaining({ repoName: 'sva_sys_patch/reservations/1/1' }),
    );
    expect(
      (await source.getServiceCommand({ serviceIndex: 5 })).result.success
        .commandName,
    ).toBe('completeBooking');
    expect(
      (await source.getServiceCommand({ serviceIndex: 6 })).result.success
        .commandName,
    ).toBe('completeBooking');
    expect(
      (await source.getServiceCommand({ serviceIndex: 7 })).result.success,
    ).toBeNull();
    expect(
      (await (await chain('inventory')).getServiceCommand({ serviceIndex: 3 }))
        .result.success,
    ).toBeNull();

    // A separately named projection has only its own namespace, release-local retained
    // history and a platform-scoped issuer. No StableWorker route can wake this object.
    const publishedRows = (
      await (
        await repo('reservations')
      ).getRepoTableRows({ tableName: reservationTable })
    ).result.success.rows;
    const replayScope = { systemId, ...service, throughIndex: 0 };
    let alarmReceipts = 0;
    const projection = {
      ...common,
      name: 'cold-reservations',
      script: patched,
      durableObjects: {
        SERVICE_VERSION_REPO: {
          className: 'ServiceVersionRepo',
          useSQLite: true,
        },
        SERVICE_VERSION_CHAIN: {
          className: 'ServiceVersionChain',
          scriptName: 'reservations',
          useSQLite: true,
        },
      },
      bindings: owners[0]!.bindings,
      serviceBindings: {
        ZEROSPIN_HOSTED_RELEASE_RPC: {
          name: 'stable',
          entrypoint: 'ReservationReplay',
          props: replayScope,
        },
        ALARM_OBSERVER: () => {
          alarmReceipts += 1;
          return new Response(null, { status: 204 });
        },
      },
    };
    const withProjection = () =>
      convertV4MiniflareOptions({
        resourcePersistencePath: storage,
        workers: [stable, ...owners, projection],
      });
    await flare.dispose();
    flare = new Miniflare(withProjection());
    const projectionName = 'svr_' + systemId + '/reservations/1';
    const cold = (
      await flare.getBindings('cold-reservations')
    ).SERVICE_VERSION_REPO.getByName(projectionName);
    expect(
      (await cold.getRepoTableRows({ tableName: reservationTable })).result
        .success.rows,
    ).toEqual([]);
    const registrations = () =>
      catalog().then(db =>
        db.getRepoRegistrations({ repoType: 'ServiceVersionRepo' }),
      );
    const originalRegistration = expect.objectContaining({
      repoName: projectionName,
      tableNames: expect.arrayContaining([reservationTable]),
    });
    expect((await registrations()).result.success).toContainEqual(
      originalRegistration,
    );
    const sentinel = {
      repoType: 'ServiceVersionRepo',
      repoName: projectionName,
      tableNames: ['waiting_for_alarm'],
    };
    expect(
      (
        await (
          await catalog()
        ).registerRepo({ systemSpecHash: spec.hash, registration: sentinel })
      ).result._tag,
    ).toBe('Success');
    expect((await registrations()).result.success).toContainEqual(sentinel);
    await cold.scheduleAlarmForProof(Date.now() + 2500);
    await flare.dispose();

    // Only the alarm can signal the observer. Registration and bounded replay finish
    // inside the actual Repo's startup gate before its native recovery handler returns.
    expect(alarmReceipts).toBe(0);
    replayScope.throughIndex = 6;
    flare = new Miniflare(withProjection());
    await flare.ready;
    await expect.poll(() => alarmReceipts, poll).toBeGreaterThan(0);
    expect((await registrations()).result.success).toContainEqual(
      originalRegistration,
    );
    const scoped = await flare.getBindings('cold-reservations');
    const recovered = scoped.SERVICE_VERSION_REPO.getByName(projectionName);
    expect(
      (await recovered.getRepoTableRows({ tableName: reservationTable })).result
        .success.rows,
    ).toEqual(publishedRows);
    expect(scoped.SYSTEM_REPO).toBeUndefined();
    expect(scoped.SERVICE_CHAIN).toBeUndefined();
    const subscriber = await recovered.replayCommandsFanoutSubscriber({
      systemId,
      serviceName: 'reservations',
    });
    await expect(
      Promise.resolve().then(() => subscriber.subscribe(7)),
    ).rejects.toThrow('Page outside release replay boundary');
    const capability = await scoped.ZEROSPIN_HOSTED_RELEASE_RPC.getReleaseRpc({
      systemId: 'other',
      serviceName: 'inventory',
    });
    const page = await capability.readReplayPage(0, 1);
    expect(page.result.success.rows).toMatchObject([
      { serviceName: 'reservations', serviceIndex: 1 },
    ]);
    await expect(
      Promise.resolve().then(() => capability.readReplayPage(0, 7)),
    ).rejects.toThrow('Page outside release replay boundary');
    await expect(
      Promise.resolve().then(() => capability.registerSystemSpec({ spec })),
    ).rejects.toThrow();
  } finally {
    await flare.dispose();
    await rm(storage, { recursive: true, force: true });
  }
}, 90000);
