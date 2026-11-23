import {
  makeSpanLinkId,
  readSpanTraceContext,
  readValidTraceContext,
  type ISpanLinkRecord,
  type ISpanRecord,
} from '@zerospin/logger';

/** Correlate the actual invocation root without asserting hosted persistence. */
export function makeRpcTraceLink(props: {
  root: ISpanRecord | undefined;
  methodName: string;
  request: unknown;
}): ISpanLinkRecord | null {
  const { root, methodName, request } = props;
  try {
    const context = readValidTraceContext(
      typeof request === 'object' &&
        request !== null &&
        'traceContext' in request
        ? request.traceContext
        : null,
    );
    if (
      root === undefined ||
      root.parentSpanId !== null ||
      root.name !== methodName ||
      readSpanTraceContext(root) === null ||
      context === null
    ) {
      return null;
    }
    return {
      linkId: makeSpanLinkId(),
      traceId: root.traceId,
      spanId: root.spanId,
      priorTraceId: context.traceId,
      priorSpanId: context.parentSpanId,
      kind: 'causedBy',
    };
  } catch {
    return null;
  }
}
