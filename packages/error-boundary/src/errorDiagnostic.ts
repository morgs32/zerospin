import {
  getBackendTrace,
  ZerospinErrorSchema,
  type IBackendTrace,
} from '@zerospin/error';
import * as Schema from 'effect/Schema';

const isDiagnosticError = Schema.is(Schema.toEncoded(ZerospinErrorSchema));

export type IErrorDiagnostic = {
  errorKind: string;
  errorCode: string | null;
  message: string;
  status: number | null;
  structuredDetailsLabel: string | null;
  structuredDetails: unknown;
  cause: string | null;
  stack: string | null;
  diagnostics: unknown;
  backendTrace: IBackendTrace | null;
  digest: string | null;
};

export function getErrorDiagnostic(props: {
  error: unknown;
}): IErrorDiagnostic {
  const { error } = props;
  const diagnostic: IErrorDiagnostic = {
    errorKind: 'Unknown thrown value',
    errorCode: null,
    message: 'The thrown value could not be converted to text.',
    status: null,
    structuredDetailsLabel: null,
    structuredDetails: null,
    cause: null,
    stack: null,
    diagnostics: null,
    backendTrace: getBackendTrace(error),
    digest: null,
  };

  if (isDiagnosticError(error)) {
    diagnostic.errorKind = error._tag;
    diagnostic.errorCode = error.code;
    diagnostic.message = error.message;
    diagnostic.status = error.status;
    diagnostic.structuredDetailsLabel = error.extra === null ? null : 'Extra';
    diagnostic.structuredDetails = error.extra;
    diagnostic.cause = error.cause;
    diagnostic.diagnostics = {
      tag: error._tag,
      code: error.code,
      message: error.message,
      status: error.status,
      extra: error.extra,
      cause: error.cause,
    };
  } else if (error instanceof Error) {
    diagnostic.errorKind = error.name.length === 0 ? 'Error' : error.name;
    diagnostic.message = error.message;
    diagnostic.stack = error.stack ?? null;
    diagnostic.digest =
      'digest' in error && typeof error.digest === 'string'
        ? error.digest
        : null;
    diagnostic.diagnostics = {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
      digest: diagnostic.digest,
    };
  } else {
    try {
      diagnostic.message = String(error);
    } catch {
      // Retain a displayable diagnostic for values with a throwing toString.
    }
    diagnostic.diagnostics = { value: diagnostic.message };
  }

  return diagnostic;
}
