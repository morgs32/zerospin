import {
  isZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
} from '@zerospin/error';

/** Preserve domain failures and encode unexpected request failures once. */
export function makeFetchFailureResponse(error: unknown): Response {
  const failure = isZerospinError(error)
    ? error
    : makeZerospinError({
        code: 'system-fetch-failed',
        message: 'SystemRepo request failed',
        cause: prettyUnknownFailure(error),
        status: 500,
      });
  return Response.json(
    {
      cause: failure.cause,
      code: failure.code,
      extra: failure.extra,
      message: failure.message,
      status: failure.status,
    },
    {
      status: failure.status ?? 500,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
