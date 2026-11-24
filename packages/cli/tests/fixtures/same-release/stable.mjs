import { configureServingSystemSpec } from '@zerospin/system-worker/workerConfiguration/workerConfiguration';
import { env, RpcTarget, WorkerEntrypoint } from 'cloudflare:workers';
export { SystemRepo } from '@zerospin/system-worker/SystemRepo/SystemRepo';
export { ServiceChain } from '@zerospin/system-worker/ServiceChain/ServiceChain';

configureServingSystemSpec(JSON.stringify(env.SNAPSHOT));

// oxlint-disable-next-line import/no-default-export -- Workerd loads the default entrypoint for fetch requests.
export default class extends WorkerEntrypoint {
  async fetch(request) {
    if (new URL(request.url).pathname !== '/systems/sys_patch/ins_patch') {
      return new Response(null, { status: 404 });
    }
    if (request.headers.get('Authorization') !== 'Bearer customer-fixture') {
      return new Response(null, { status: 401 });
    }
    if (request.method === 'POST') {
      const payload = await request.json();
      const chain = this.env.SERVICE_CHAIN.getByName(
        'sc_sys_patch/reservations',
      );
      const { result } = await chain.admitDirectSystemCommand({
        command: {
          kind: 'system',
          serviceName: 'reservations',
          serviceVersion: 1,
          commandName: 'Book',
          contractVersion: 1,
          payload: JSON.stringify(payload),
        },
      });
      return Response.json(result);
    }
    using repo = await this.env.RESERVATIONS.getServiceVersionRepo({
      systemId: 'sys_patch',
      serviceName: 'reservations',
      serviceVersion: 1,
    });
    return Response.json(
      (await repo.getRepoTableRows({ tableName: this.env.RESERVATION_TABLE }))
        .result,
    );
  }
}

// This binding is issued by the fixture platform only to the Reservations owner.
export class ReservationExecution extends WorkerEntrypoint {
  async startServiceExecution(serviceIndex) {
    const allowed = await this.env.FAULTS.fetch(
      'https://faults.invalid/start/' + serviceIndex,
    );
    if (!allowed.ok) {
      throw new Error('Delivery is paused before first execution');
    }
    const { result } = await this.env.SYSTEM_REPO.getByName(
      'sys_patch',
    ).startServiceExecution({
      serviceName: 'reservations',
      serviceVersion: 1,
      serviceIndex,
    });
    if (result._tag !== 'Success') throw new Error(JSON.stringify(result));
    return result.success;
  }
}

// The platform supplies the Instance, release and permitted history prefix on this binding.
export class ReservationReplay extends WorkerEntrypoint {
  async getReleaseRpc() {
    const { systemId, serviceName, serviceVersion, throughIndex, writable } =
      this.ctx.props;
    const { spec } = this.env.SNAPSHOT;
    const catalog = this.env.SYSTEM_REPO.getByName(systemId);
    const accepted = await catalog.getAcceptedSystemSpec(spec.hash);
    if (accepted.result._tag !== 'Success' || !accepted.result.success) {
      throw new Error('Unaccepted release');
    }
    const chain = this.env.SERVICE_CHAIN.getByName(
      'sc_' + systemId + '/' + serviceName,
    );
    const releaseName = systemId + '/' + serviceName + '/' + serviceVersion;
    let replayBoundary = throughIndex;
    if (replayBoundary === undefined) {
      using queue = await chain.replayCommandsFanout;
      const tip = await queue.getPage({ afterIndex: 0, maxIndex: 0 });
      if (tip.result._tag !== 'Success') {
        throw new Error('Could not read finalized replay boundary');
      }
      replayBoundary = tip.result.success.lastIndex;
    }
    return new (class extends RpcTarget {
      registerRepo(registration) {
        const { repoType, repoName } = registration;
        const archivePrefix = 'sva_' + releaseName + '/';
        const archiveIndex = repoName.slice(archivePrefix.length);
        if (
          !(
            repoType === 'ServiceVersionRepo' &&
            repoName === 'svr_' + releaseName
          ) &&
          !(
            writable &&
            repoType === 'ServiceVersionChain' &&
            repoName === 'svc_' + releaseName
          ) &&
          !(
            writable &&
            repoType === 'ServiceVersionArchive' &&
            repoName.startsWith(archivePrefix) &&
            /^[1-9]\d*$/.test(archiveIndex) &&
            Number.isSafeInteger(Number(archiveIndex))
          )
        ) {
          throw new Error('Registration outside owner release');
        }
        return catalog.registerRepo({
          systemSpecHash: spec.hash,
          registration,
        });
      }

      async executeCommandsThrough(serviceIndex) {
        if (
          !writable ||
          !Number.isSafeInteger(serviceIndex) ||
          serviceIndex < 1
        ) {
          throw new Error('Invalid writable Service command index');
        }
        const command = await chain.getServiceCommand({ serviceIndex });
        if (command.result._tag === 'Failure') return command;
        const row = command.result.success;
        if (
          row === null ||
          row.serviceIndex !== serviceIndex ||
          row.serviceName !== serviceName ||
          (row.outcome === null
            ? row.serviceVersion !== serviceVersion
            : serviceIndex > replayBoundary)
        ) {
          throw new Error('Command outside owner release');
        }
        return chain.executeCommandsThrough(serviceIndex);
      }

      async prepareServiceReplayInput(serviceIndex, commandId) {
        const page = await this.readReplayPage(serviceIndex - 1, serviceIndex);
        if (page.result._tag === 'Failure') return page;
        if (page.result.success.rows[0]?.id !== commandId) {
          throw new Error('Unknown replay command');
        }
        return chain.prepareServiceReplayInput({
          systemId,
          serviceName,
          serviceIndex,
          commandId,
          receivingServiceVersion: serviceVersion,
        });
      }

      async readServiceBranchCommand(serviceIndex) {
        if (
          !Number.isSafeInteger(serviceIndex) ||
          serviceIndex < 1 ||
          serviceIndex > replayBoundary
        ) {
          throw new Error('Command outside release replay boundary');
        }
        return chain.readServiceBranchCommand({ serviceVersion, serviceIndex });
      }

      async readReplayPage(afterIndex, maxIndex) {
        using queue = await chain.replayCommandsFanout;
        const through = maxIndex ?? replayBoundary;
        if (
          !Number.isSafeInteger(afterIndex) ||
          afterIndex < 0 ||
          !Number.isSafeInteger(through) ||
          through < 0 ||
          through > replayBoundary
        ) {
          throw new Error('Page outside release replay boundary');
        }
        const page = await queue.getPage({ afterIndex, maxIndex: through });
        if (page.result._tag === 'Failure') return page;
        const { rows, lastIndex } = page.result.success;
        return {
          ...page,
          result: {
            _tag: 'Success',
            success: { rows, lastIndex: Math.min(lastIndex, replayBoundary) },
          },
        };
      }
    })();
  }
}
