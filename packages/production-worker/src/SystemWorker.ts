/* eslint-disable perfectionist/sort-exports */
import { VERIFY_OWNER_RELEASE_BINDING_PATH } from '@zerospin/core/system/ownerReleaseDeployment';
import {
  BootstrapGatewayApi,
  GatewayApi,
} from '@zerospin/system-worker/GatewayApi/GatewayApi';
import { newWorkersRpcResponse } from 'capnweb';
import { env, WorkerEntrypoint } from 'cloudflare:workers';

import { verifyOwnerReleaseBinding } from './verifyOwnerReleaseBinding.js';

if (
  env.ZEROSPIN_SECRET_KEY.length === 0 ||
  env.ZEROSPIN_PUBLISHABLE_KEY.length === 0
) {
  throw new Error(
    'SystemWorker requires non-empty ZEROSPIN_SECRET_KEY and ZEROSPIN_PUBLISHABLE_KEY',
  );
}

export { AggregateChain } from '@zerospin/system-worker/AggregateChain/AggregateChain';
export { ServiceChain } from '@zerospin/system-worker/ServiceChain/ServiceChain';
export { SystemRepo } from '@zerospin/system-worker/SystemRepo/SystemRepo';
export { configureServingSystemSpec } from '@zerospin/system-worker/workerConfiguration/workerConfiguration';

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoints are default exports.
export default class SystemWorker extends WorkerEntrypoint {
  override async fetch(request: Request): Promise<Response> {
    const versionHeader = 'X-Zerospin-Worker-Version';
    const versionId = env.ZEROSPIN_VERSION_METADATA.id;
    const url = new URL(request.url);
    if (env.ZEROSPIN_DEPLOYMENT_BOOTSTRAP === true) {
      const response = await newWorkersRpcResponse(
        request,
        new BootstrapGatewayApi(),
      );
      response.headers.set(versionHeader, versionId);
      return response;
    }
    const isSessionSocket =
      url.pathname === '/ws-aggregate-session-commands' ||
      url.pathname === '/ws-service-session-commands';

    if (isSessionSocket) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return Response.json(
          { message: 'Expected WebSocket upgrade' },
          { status: 426 },
        );
      }
      const tickets = url.searchParams.getAll('ticket');
      if (
        url.searchParams.size !== 1 ||
        tickets.length !== 1 ||
        tickets[0] === undefined ||
        !/^[A-Za-z0-9_-]{43}$/.test(tickets[0])
      ) {
        return Response.json(
          { message: 'Missing or invalid WebSocket parameters' },
          { status: 400 },
        );
      }
    }

    if (isSessionSocket) {
      return env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID).fetch(request);
    }
    const response =
      url.pathname === VERIFY_OWNER_RELEASE_BINDING_PATH
        ? await verifyOwnerReleaseBinding(request)
        : await newWorkersRpcResponse(request, new GatewayApi());
    response.headers.set(versionHeader, versionId);
    return response;
  }
}
