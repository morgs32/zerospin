import * as Schema from 'effect/Schema';
import * as SchemaIssue from 'effect/SchemaIssue';

export const rethrowSchemaError = (error: unknown): never => {
  if (Schema.isSchemaError(error)) {
    throw error;
  }
  if (error instanceof Error && SchemaIssue.isIssue(error.cause)) {
    throw new Schema.SchemaError(error.cause);
  }
  throw error;
};
