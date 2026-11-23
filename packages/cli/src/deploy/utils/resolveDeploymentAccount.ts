import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IWranglerDeploymentWorkspace } from './deploymentTypes.js';
import { runWranglerCommand } from './runWranglerCommand.js';

const Accounts = Schema.Struct({
  accounts: Schema.Array(Schema.Struct({ id: Schema.String })),
});

export const resolveDeploymentAccount = Effect.fn('resolveDeploymentAccount')(
  function* (workspace: IWranglerDeploymentWorkspace) {
    const configured =
      workspace.environment['CLOUDFLARE_ACCOUNT_ID'] ??
      workspace.environment['CF_ACCOUNT_ID'];
    let accountId = configured?.trim();
    if (accountId === undefined) {
      const { stdout } = yield* runWranglerCommand(workspace, [
        'whoami',
        '--json',
      ]);
      const identity = yield* Effect.try({
        try: () => Schema.decodeUnknownSync(Accounts)(JSON.parse(stdout)),
        catch: () =>
          makeZerospinError({
            code: 'zerospin-deployment-account-unknown',
            message:
              'Wrangler could not identify a Cloudflare account. Set CLOUDFLARE_ACCOUNT_ID.',
          }),
      });
      if (identity.accounts.length === 1) accountId = identity.accounts[0]?.id;
    }
    if (!accountId || !/^[0-9a-f]{32}$/i.test(accountId)) {
      return yield* makeZerospinError({
        code: 'zerospin-deployment-account-unknown',
        message:
          'Set CLOUDFLARE_ACCOUNT_ID to the account ID for this deployment.',
      });
    }
    workspace.environment['CLOUDFLARE_ACCOUNT_ID'] = accountId.toLowerCase();
    return accountId.toLowerCase();
  },
);
