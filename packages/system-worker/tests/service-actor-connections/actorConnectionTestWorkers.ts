import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';

import type { IServiceConnectionState } from '../../src/ServiceActorVersionChain/connectionState.ts';
import { ServiceActorVersionChain } from '../../src/ServiceActorVersionChain/ServiceActorVersionChain.ts';
import { ServiceChain } from '../../src/ServiceChain/ServiceChain.ts';
import { SystemRepo } from '../../src/SystemRepo/SystemRepo.ts';

export class ActorConnectionTestSystemRepo extends SystemRepo {
  async clearAcceptedDevelopmentSpec(): Promise<void> {
    this.db.delete(this.schema.acceptedSystemSpecs).run();
  }
}

export class ActorConnectionTestServiceChain extends ServiceChain {
  override async admitServiceCommands(
    input: Parameters<ServiceChain['admitServiceCommands']>[0],
  ) {
    await env.BUCKET.put('actor-command-admission/' + crypto.randomUUID(), '');
    return super.admitServiceCommands(input);
  }
}

export class HistoricalActorConnectionTestChain extends ServiceActorVersionChain {
  async readConnectionLocks() {
    return this.db
      .select()
      .from(this.schema.connectionLocks)
      .orderBy(this.schema.connectionLocks.connectionId)
      .all();
  }

  async readConnectionPhases() {
    return Array.from(
      this.getConnections<IServiceConnectionState>(),
      connection => ({
        id: connection.id,
        phase: connection.state?.phase,
      }),
    ).toSorted((left, right) => left.id.localeCompare(right.id));
  }

  async replaceConnectionLock(input: {
    connectionId: string;
    contractVersions: string;
    modelNames: string;
  }): Promise<void> {
    const { connectionId, ...lock } = input;
    this.db
      .update(this.schema.connectionLocks)
      .set(lock)
      .where(eq(this.schema.connectionLocks.connectionId, connectionId))
      .run();
  }
}
