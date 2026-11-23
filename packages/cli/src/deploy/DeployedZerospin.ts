import { ZerospinSuccess } from '@zerospin/core/success/ZerospinSuccess';
import * as Schema from 'effect/Schema';

export const DeployedZerospin = ZerospinSuccess.schema({
  code: 'zerospin-deployed',
  data: Schema.Struct({
    workerName: Schema.String,
    versionId: Schema.String,
    zerospinPublishableKey: Schema.String,
  }),
});
