# Browser SharedWorker startup diagnostics

**Research date:** 2026-11-02. **Baseline:** Zerospin 38.2.1, commit
`5e597bcd823f1a42db6d0bfd071f0dd70eae8143`. The installed Mentor Mailbox
38.1.1 acquisition and Service connection paths were identical to that baseline.
This research establishes a diagnostic gap; it does not establish the cause of
the original Admin startup failure.

## What the baseline loses

`makeConnectedServiceConnection` passes its 15-second acquisition/readiness
startup timer, SharedWorker failure callback, and broken RPC callback through the
same `lost` handler. Without a native error, it constructs
`node-connection-unavailable`. The startup timer clears after RPC readiness and
artifact/version validation; authentication and socket attachment have separate
owners and deadlines.
[Source](https://github.com/morgs32/zerospin/blob/5e597bcd823f1a42db6d0bfd071f0dd70eae8143/packages/browser/src/ServiceNode/makeConnectedServiceConnection.ts#L163-L228).

`acquireWorkerPort` already has observable steps: document-liveness Web Lock,
SharedWorker construction, bootstrap submission, and client acceptance. Its fresh
`clientId` is already sent to the SharedWorker. The baseline retains
`ErrorEvent.error` only when present and loses the reason for malformed or
mismatched bootstrap replies.
[Source](https://github.com/morgs32/zerospin/blob/5e597bcd823f1a42db6d0bfd071f0dd70eae8143/packages/browser/src/Node/acquireWorkerPort.ts#L31-L114).

`makeWorkerConnections` catches owner/API construction failures and rejects the
bootstrap without printing the original failure. Reporting that cause inside the
SharedWorker can therefore provide evidence that the page never receives.
[Source](https://github.com/morgs32/zerospin/blob/5e597bcd823f1a42db6d0bfd071f0dd70eae8143/packages/browser/src/Node/makeWorkerConnections.ts#L134-L218).

## Existing infrastructure and scope

Connected Aggregate sessions already offer opt-in startup logs, native Effect
spans, and a worker telemetry bridge. Service sessions have no diagnostics input
and register with DevTools only after successful startup. The implementation
adds tab-side Service diagnostics and early registration while preserving the
existing Aggregate bridge; it does not add Service attachment fields or a new
worker telemetry protocol.
[Aggregate factory](https://github.com/morgs32/zerospin/blob/5e597bcd823f1a42db6d0bfd071f0dd70eae8143/packages/browser/src/makeConnectedAggregateSession.ts#L143-L200),
[Service factory](https://github.com/morgs32/zerospin/blob/5e597bcd823f1a42db6d0bfd071f0dd70eae8143/packages/browser/src/makeConnectedServiceSession.ts#L118-L174),
[Service attachment interface](https://github.com/morgs32/zerospin/blob/5e597bcd823f1a42db6d0bfd071f0dd70eae8143/packages/browser/src/ServiceNode/ServiceSharedWorkerApi.ts#L15-L39).

The recent [System Worker diagnostic plan](../archive/plans/285-plan-worker-failure-diagnostics.md)
covers escaping Effect Causes in Cloudflare execution. It does not cover browser
SharedWorker module loading or the page-side handshake. Public worker RPC error
encoding deliberately removes private native details; local diagnostic reporting
must not widen that interface.
[Public RPC error handling](../../packages/browser/src/Node/publicRpcError.ts),
[public error encoding](../../packages/error/src/encodeError.ts).

## Browser limits

SharedWorker startup fetch/parse failure can fire a plain `Event` on the page's
SharedWorker object. Error message and source location are useful when available,
but their absence is not proof that no error occurred. Module-graph loading may
fail before any framework module body, logging statement, or handler executes.
[HTML worker processing model](https://html.spec.whatwg.org/multipage/workers.html#worker-processing-model).

Uncaught errors first reach the worker global. HTML forwards owner-realm runtime
errors specifically for dedicated workers, so page-global listeners cannot be
relied on to collect SharedWorker failures. `messageerror` specifically means
message deserialization failed; it does not establish a worker crash or RPC
disconnection. Diagnostic listeners must preserve native reporting rather than
canceling `error` or `unhandledrejection` events.
[HTML error reporting](https://html.spec.whatwg.org/multipage/webappapis.html#report-an-error),
[MessagePort processing](https://html.spec.whatwg.org/multipage/web-messaging.html#dom-messageport-postmessage-options).

## Operational evidence

Record the current phase, last completed milestone, elapsed time, bounded failure
reason, sanitized module URL, and existing client ID. Read tab and SharedWorker
console records together; a worker-local record may reveal an owner/API failure
that the page only observes as rejection. A last completed milestone establishes
what finished, not the hidden cause of the next stalled operation.

In Chrome, open `chrome://inspect/#workers` and inspect the SharedWorker. Preserve
the page Console and Network logs and the worker Console independently before
reproducing and retrying. Check console context filters when worker output is
missing.
[Chrome SharedWorker inspection](https://developer.chrome.com/blog/extended-lifetime-shared-workers-origin-trial),
[Console Preserve Log](https://developer.chrome.com/docs/devtools/console/reference/#persist),
[console context settings](https://developer.chrome.com/docs/devtools/settings/preferences/#console),
[Network Preserve Log](https://developer.chrome.com/docs/devtools/network/reference/#preserve-log).

## Delivery boundary

The approved change is framework-only. It adds automatic bounded failure logs in
all environments and keeps successful startup tracing opt-in. It does not add
persistent diagnostic storage, alter public error encoding, change deadlines or
retry policy, reset databases, publish packages, or upgrade consumers.

PR #118 review narrowed automatic failure output to selected metadata, fixed
categories, and recognized connection/snapshot codes. Rendered error messages,
stacks, arbitrary string causes, and event messages are excluded because they can
contain private validation inputs. Existing session error propagation and native
browser reporting are unchanged. See the
[formatter research](browser-diagnostic-error-formatting.md) for the verified
Effect behavior and the privacy boundary.
