import { RUN_OWNER_OPERATION_PATH } from '@zerospin/core/system/ownerReleaseDeployment';
import { makeServiceReleaseWorker } from '@zerospin/owner-release-worker/ServiceReleaseWorker';
import { env, RpcTarget } from 'cloudflare:workers';
import { inventory, reservations } from 'original-artifact';
import { retained } from 'retained-builds';

const release =
  env.ZEROSPIN_OWNER_RELEASE.serviceName === 'reservations'
    ? reservations
    : inventory;
const {
  ServiceReleaseWorker,
  ServiceVersionRepo: NativeRepo,
  ServiceVersionChain,
  ServiceVersionArchive,
} = makeServiceReleaseWorker(
  release,
  {
    systemId: env.ZEROSPIN_SYSTEM_ID,
    systemName: env.ZEROSPIN_SYSTEM_NAME,
    systemSpecHash: env.ZEROSPIN_SYSTEM_SPEC_HASH,
  },
  release === reservations ? retained : undefined,
);

export { ServiceVersionChain, ServiceVersionArchive };
// oxlint-disable-next-line import/no-default-export -- Workerd loads the default entrypoint for fetch requests.
export default class extends ServiceReleaseWorker {
  async fetch(request) {
    if (new URL(request.url).pathname === RUN_OWNER_OPERATION_PATH) {
      const ready = await env.FAULTS.fetch('https://faults.invalid/map');
      if (!ready.ok) return new Response(null, { status: 503 });
    }
    return super.fetch(request);
  }
}

// Lose the response after the real Repo's transaction has committed.
export class ServiceVersionRepo extends NativeRepo {
  scheduleAlarmForProof(time) {
    return this.ctx.storage.setAlarm(time);
  }

  async onAlarm() {
    await super.onAlarm();
    if (this.env.ALARM_OBSERVER) {
      await this.env.ALARM_OBSERVER.fetch('https://observer.invalid/recovered');
    }
  }

  get executeCommandSubscriber() {
    const actual = super.executeCommandSubscriber;
    return new (class extends RpcTarget {
      async receive(commands) {
        const result = await actual.receive(commands);
        if (
          result.result._tag === 'Success' &&
          release === reservations &&
          commands[0].serviceIndex === 4
        ) {
          const ready = await env.FAULTS.fetch('https://faults.invalid/ack');
          if (!ready.ok) throw new Error('Lost acknowledgement after commit');
        }
        return result;
      }
    })();
  }
}
