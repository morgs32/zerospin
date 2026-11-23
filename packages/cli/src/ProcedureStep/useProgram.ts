import { useEffect, useMemo, useRef, useState } from 'react';

import {
  makeZerospinError,
  type IAnyError,
  type IZerospinError,
} from '@zerospin/error';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';

type IProps<TData, TError> = {
  fetcher: () => Effect.Effect<TData, TError, never>;
};

type IState<TData, TError> = {
  data: TData | undefined;
  error: TError | undefined;
  status: 'error' | 'loading' | 'success';
};

type ILoadingState<TData, TError> = {
  status: 'loading';
} & IState<TData, TError>;

type ISuccessState<TData, TError> = {
  status: 'success';
} & IState<TData, TError>;

type IErrorState<TData, TError> = {
  data: undefined;
  error: TError;
  status: 'error';
} & IState<TData, TError>;

export type IUseProgramResult<TData, TError> =
  | IErrorState<TData, TError>
  | ILoadingState<TData, TError>
  | ISuccessState<TData, TError>;

export function useProgram<TData, TError extends IAnyError = IAnyError>(
  options: IProps<TData, TError>,
): IUseProgramResult<TData, TError | IZerospinError<'unexpected-error'>> {
  const { fetcher } = options;
  // Ink re-renders often; a new inline `() => myEffect` each time must not
  // retrigger this effect (that caused an infinite fetch loop in the CLI).
  const fetcherRef = useRef(fetcher);

  const [exit, setExit] = useState<Exit.Exit<TData, TError> | undefined>(
    undefined,
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new globalThis.AbortController();
    Effect.runPromiseExit(fetcherRef.current(), {
      signal: controller.signal,
    }).then(result => {
      if (controller.signal.aborted) return;
      setExit(result);
      setIsLoading(false);
    });
    return () => controller.abort();
  }, []);

  return useMemo(() => {
    if (isLoading || !exit) {
      return {
        data: undefined,
        error: undefined,
        status: 'loading' as const,
      };
    }
    if (Exit.isFailure(exit)) {
      const reason = exit.cause.reasons[0];
      const error =
        exit.cause.reasons.length === 1 &&
        reason !== undefined &&
        Cause.isFailReason(reason)
          ? reason.error
          : makeZerospinError({
              code: 'unexpected-error',
              message: Cause.pretty(exit.cause),
              cause: Cause.pretty(exit.cause),
            });
      return {
        data: undefined,
        error,
        status: 'error' as const,
      };
    }
    return {
      data: exit.value,
      error: undefined,
      status: 'success' as const,
    };
  }, [isLoading, exit]);
}
