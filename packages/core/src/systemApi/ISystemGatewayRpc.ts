import type { RpcTarget } from 'capnweb';

import type { ISystemApiRpc } from './ISystemApiRpc.ts';

/** Public capability selection independent of the Worker implementation. */
export interface ISystemGatewayRpc extends RpcTarget {
  getSystemApi(props: { zerospinSecretKey: string }): Promise<ISystemApiRpc>;
}
