import * as Schema from 'effect/Schema';

export const DeploymentWorkerVersionArgsSchema = Schema.mutable(
  Schema.Tuple([
    Schema.optionalKey(
      Schema.Struct({ expectedVersionId: Schema.NonEmptyString }),
    ),
  ]),
);

export type IDeploymentWorkerVersionArgs =
  typeof DeploymentWorkerVersionArgsSchema.Encoded;
