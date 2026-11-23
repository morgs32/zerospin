import type {
  IServiceAgentRelease,
  IServiceAgentSession,
  IServiceAgentSessionInputs,
} from '@zerospin/core/agent/types';
import type { ServiceAgentNode } from '@zerospin/core/ServiceAgentNode/ServiceAgentNode';
import type { IAnyError } from '@zerospin/error';
import type { Layer } from 'effect';

import { makeAgentSessionHost } from './agentNodeBrowser/makeAgentSessionHost.ts';
import { bootstrapServiceAgentSession } from './bootstrapServiceAgentSession.ts';
import { applicationLayer } from './browserSession/applicationLayer.ts';

/** Construct a cold observer; initialize acquires its single transient selected view. */
export function makeServiceAgentSession<
  const RELEASE extends IServiceAgentRelease,
  APP_LAYER extends Layer.Layer<never, IAnyError, never> = Layer.Layer<
    never,
    never
  >,
>(
  props: {
    agentRelease: RELEASE;
    layer?: APP_LAYER;
  } & IServiceAgentSessionInputs,
) {
  const {
    agentRelease,
    layer,
    serviceName,
    serviceVersion,
    bootstrap,
    sqliteModuleFactory,
  } = props;
  const inputs: IServiceAgentSessionInputs = {
    serviceName,
    serviceVersion,
    bootstrap,
    ...(sqliteModuleFactory === undefined ? {} : { sqliteModuleFactory }),
  };
  const host = makeAgentSessionHost<ServiceAgentNode<RELEASE>>({
    layer: applicationLayer(layer),
    bootstrap: context =>
      bootstrapServiceAgentSession({
        ...context,
        agentRelease,
        inputs,
      }),
  });
  const session: IServiceAgentSession<
    RELEASE,
    Layer.Success<APP_LAYER>
  > = Object.assign(host, { agentRelease });
  return Object.freeze(session);
}
