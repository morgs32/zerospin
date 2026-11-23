import { ZerospinErrorJsonSchema } from '@zerospin/error';
import * as Schema from 'effect/Schema';

import { TelemetryBatchSchema } from './TelemetryBatchSchema.ts';
import { SpanLinkRecordSchema } from './TraceContextSchema.ts';

const RpcResultSchema = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal('Success'), success: Schema.Unknown }),
  Schema.Struct({
    _tag: Schema.Literal('Failure'),
    failure: Schema.Struct({
      ...ZerospinErrorJsonSchema.fields,
      scope: Schema.optionalKey(
        Schema.Literals(['contract', 'actor', 'aggregate']),
      ),
    }),
  }),
]);
export const InternalRpcEnvelopeSchema = Schema.Struct({
  result: RpcResultSchema,
  telemetry: TelemetryBatchSchema,
});
export const LinkedRpcEnvelopeSchema = Schema.Struct({
  result: RpcResultSchema,
  link: Schema.NullOr(SpanLinkRecordSchema),
});
