import { ZerospinSuccess } from '@zerospin/core/success/ZerospinSuccess';
import * as Schema from 'effect/Schema';

export const GeneratedProductionKeys = ZerospinSuccess.schema({
  code: 'production-keys-generated',
  data: Schema.Struct({
    envFilePath: Schema.String,
    zerospinPublishableKey: Schema.String,
    zerospinSecretKey: Schema.String,
  }),
});
