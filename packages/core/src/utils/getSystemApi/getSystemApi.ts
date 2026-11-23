import '@zerospin/server-only';
import * as Effect from 'effect/Effect';
import * as Redacted from 'effect/Redacted';

import { SecretKey } from '../../services/SecretKey.ts';
import { ZerospinApiUrl } from '../../services/ZerospinApiUrl.ts';
import type { ISystemGatewayRpc } from '../../systemApi/ISystemGatewayRpc.ts';
import { getApi } from '../getApi/getApi.ts';

import { makeSystemApi } from './makeSystemApi.ts';

/** Acquire the HTTP administrative capability and expose typed methods. */
export const getSystemApi = Effect.fn('getSystemApi')(function* () {
  const apiUrl = yield* ZerospinApiUrl;
  const secretKey = yield* SecretKey;
  const rpc = yield* getApi<ISystemGatewayRpc>(apiUrl)(gateway =>
    gateway.getSystemApi({ zerospinSecretKey: Redacted.value(secretKey) }),
  );
  return makeSystemApi({ rpc });
});
