/** Reviewed defaults for framework errors only; authored scoped failures own their prose. */
export const defaultErrorMessages = new Map<string, string>([
  [
    'actor-capability-mismatch',
    'The actor capability does not match the admitted session selection.',
  ],
  [
    'actor-contract-lineage-unsupported',
    "The actor contract does not support the submitted contract's version lineage.",
  ],
  [
    'actor-path-invalid',
    'The actor path cannot be decoded using its declared identity pattern.',
  ],
  [
    'actor-path-noncanonical',
    'The actor path does not round-trip to its canonical identity path.',
  ],
  [
    'actor-session-origin-required',
    'An actor session requires an actor origin in its definition lock.',
  ],
  [
    'actor-version-invalid',
    'The actor version could not be resolved from its declaration.',
  ],
  [
    'actor-version-unsupported',
    'The requested actor name or version is unavailable in this release.',
  ],
  [
    'administrative-contract-unavailable',
    'This contract is unavailable to administrative commands because it requires claims or external execution.',
  ],
  [
    'admission-claims-required',
    "This actor's admission policy requires claims in the request.",
  ],
  [
    'admission-credentials-required',
    "This actor's authentication policy requires credentials in the request.",
  ],
  [
    'agent-aggregate-not-registered',
    'The selected aggregate instance is not registered for this agent.',
  ],
  [
    'agent-aggregate-unavailable',
    'The aggregate release selected by the agent is unavailable in this system.',
  ],
  [
    'agent-bootstrap-identity-invalid',
    'Agent bootstrap requires the admitted agent origin and its persistent Node identity.',
  ],
  [
    'agent-outcome-recovery-gap',
    'The retained agent outcomes do not form the complete requested recovery history.',
  ],
  [
    'agent-session-identity-mismatch',
    'The agent snapshot does not match the requested agent, aggregate, or session identity.',
  ],
  [
    'agent-session-inputs-invalid',
    'The agent session inputs do not match its declared release.',
  ],
  [
    'agent-session-name-mismatch',
    "The requested session name does not match the agent's declared session.",
  ],
  [
    'agent-unavailable',
    'The requested agent name or version is unavailable in this system.',
  ],
  [
    'agent-version-owner-unavailable',
    'The agent version does not belong to the selected aggregate release.',
  ],
  [
    'aggregate-admission-receipt-invalid',
    'The aggregate admission receipt does not match the submitted command and its valid push position.',
  ],
  [
    'aggregate-command-identity-mismatch',
    'The aggregate command differs from the retained command at its execution position.',
  ],
  [
    'aggregate-contract-unsupported',
    'The executing aggregate release does not support the submitted contract.',
  ],
  [
    'aggregate-command-owner-mismatch',
    'The aggregate command belongs to a different aggregate name or instance.',
  ],
  [
    'aggregate-command-scope-mismatch',
    "The command's actor claims do not authorize the selected aggregate instance.",
  ],
  [
    'aggregate-command-source-unavailable',
    'The aggregate release that authored this command is unavailable.',
  ],
  [
    'aggregate-committed-result-missing',
    'The committed aggregate result is missing at the requested execution position.',
  ],
  [
    'aggregate-execution-gap',
    'The aggregate command history is not contiguous with the retained execution checkpoint.',
  ],
  [
    'aggregate-execution-index-invalid',
    'The aggregate execution position must be a nonnegative safe integer.',
  ],
  [
    'aggregate-execution-index-unavailable',
    'The requested aggregate execution position exceeds the admitted command history.',
  ],
  [
    'aggregate-input-index-exhausted',
    'The aggregate command position cannot advance beyond the safe integer range.',
  ],
  [
    'aggregate-operations-missing',
    'The executed aggregate command is missing its operation batch.',
  ],
  [
    'aggregate-original-command-missing',
    'The original aggregate command is missing when its result is acknowledged.',
  ],
  [
    'aggregate-original-delivery-invalid',
    'Original Aggregate delivery requires a complete pending command.',
  ],
  [
    'aggregate-original-execution-failed',
    'The original aggregate command could not be executed.',
  ],
  [
    'aggregate-original-receipt-identity-mismatch',
    'The aggregate acknowledgement does not identify the retained original command.',
  ],
  [
    'aggregate-original-receipt-invalid',
    'An aggregate acknowledgement must contain exactly one complete original command result.',
  ],
  [
    'aggregate-original-receipt-outcome-mismatch',
    "The aggregate acknowledgement conflicts with the original command's retained outcome.",
  ],
  [
    'aggregate-original-version-mismatch',
    'The original command belongs to a different aggregate release version.',
  ],
  [
    'aggregate-progress-invalid',
    'The retained aggregate execution checkpoint is missing or invalid.',
  ],
  [
    'aggregate-query-execution-failed',
    'The aggregate query could not be executed against its authorized projection.',
  ],
  [
    'aggregate-query-invalid',
    'The aggregate query could not be compiled from its declaration.',
  ],
  [
    'aggregate-query-result-invalid',
    'The aggregate query result could not be decoded into the declared output.',
  ],
  [
    'aggregate-replay-command-pending',
    'Aggregate replay requires a completed outcome for the retained command.',
  ],
  [
    'aggregate-replay-enrollment-failed',
    'The aggregate replay subscriber could not be enrolled durably.',
  ],
  [
    'aggregate-result-checkpoint-invalid',
    'The aggregate result checkpoint does not contain a valid position and command identity.',
  ],
  [
    'aggregate-result-cursor-invalid',
    'The aggregate result cursor must be a nonnegative safe integer.',
  ],
  [
    'aggregate-result-missing',
    'The requested executed aggregate command result is unavailable.',
  ],
  [
    'aggregate-session-checkpoint-conflict',
    "The aggregate session's retained checkpoint conflicts with the received history.",
  ],
  [
    'aggregate-session-command-contract-unavailable',
    'The submitted contract is unavailable in this aggregate session definition.',
  ],
  [
    'aggregate-session-command-identity-mismatch',
    "The aggregate session command does not match the session's admitted identity.",
  ],
  [
    'aggregate-session-command-index-gap',
    'The aggregate session command history is missing the next expected position.',
  ],
  [
    'aggregate-session-command-invalid',
    'The aggregate session command does not satisfy its declared command shape.',
  ],
  [
    'aggregate-session-not-ready',
    'The aggregate session has no current initialized capability for staging or validation.',
  ],
  [
    'aggregate-session-outcome-conflict',
    'The aggregate command outcome conflicts with an outcome already retained by this session.',
  ],
  [
    'aggregate-session-recovery-incomplete',
    'The aggregate session could not recover all outcomes required by its checkpoint.',
  ],
  [
    'aggregate-session-recovery-outcome-mismatch',
    "A recovered aggregate command outcome differs from the session's retained outcome.",
  ],
  [
    'aggregate-version-unavailable',
    'The requested Aggregate release is unavailable. Refresh the page to load the latest app. If the error persists, this app bundle may be incompatible with the server deployment.',
  ],
  [
    'aggregate-version-unsupported',
    'The requested aggregate release version is unavailable in this system.',
  ],
  [
    'async-admission-failed',
    'The recorded external command could not be admitted by its owning aggregate or service.',
  ],
  [
    'async-command-invalid',
    'The asynchronous command lacks a valid recorded external outcome or supported origin.',
  ],
  [
    'async-command-owner-mismatch',
    'The asynchronous command belongs to a different owner instance.',
  ],
  [
    'async-command-recorded-input-mismatch',
    'The delivered asynchronous command differs from its durably recorded input.',
  ],
  [
    'async-emission-unregistered',
    'The emitted asynchronous operation does not identify a registered contract of the required family.',
  ],
  [
    'async-operation-aggregate-instance-mismatch',
    'The retained external operation belongs to a different aggregate instance.',
  ],
  [
    'async-operation-definition-mismatch',
    'The retained external operation does not match its declared contract name and version.',
  ],
  [
    'async-operation-definition-unavailable',
    'The contract version required by the retained external operation is unavailable.',
  ],
  [
    'async-operation-missing',
    'No retained external operation exists for this command.',
  ],
  [
    'async-operation-not-recorded',
    'The external operation has no recorded outcome from which to prepare its continuation.',
  ],
  [
    'async-operation-owner-unavailable',
    'The release that owns the retained external operation is unavailable.',
  ],
  [
    'authorization-command-claims-required',
    'Authorization commands cannot invoke contracts or emitted operations that require actor claims.',
  ],
  [
    'authorization-command-external',
    'Authorization commands cannot invoke contracts that require external execution.',
  ],
  [
    'command-outbox-index-exhausted',
    'The command outbox position cannot advance beyond the safe integer range.',
  ],
  [
    'contract-aggregate-id-required',
    'Aggregate contract evaluation requires a nonempty aggregate ID.',
  ],
  [
    'contract-failure-decode-failed',
    'The received contract failure could not be decoded using its declared failure schemas.',
  ],
  [
    'contract-failure-undeclared',
    'The contract returned a business failure that is not declared in its failures record.',
  ],
  [
    'contract-family-mismatch',
    'The contract belongs to a different family than the requested aggregate or service operation.',
  ],
  [
    'contract-guard-result-invalid',
    'A contract guard must complete without returning a result value.',
  ],
  [
    'contract-not-found',
    'The selected contract is unavailable in this session definition.',
  ],
  [
    'contract-read-filter-invalid',
    'The contract read contains an unsupported query option or filter.',
  ],
  [
    'contract-read-model-out-of-scope',
    'The contract attempted to read a model outside its declared database scope.',
  ],
  [
    'contract-read-relation-out-of-scope',
    'The contract attempted to traverse a relation outside its declared database scope.',
  ],
  [
    'contract-result-identity-mismatch',
    'The retained result belongs to a different contract name or version.',
  ],
  [
    'contract-service-aggregate-id-forbidden',
    'Service contract evaluation must not supply an aggregate ID.',
  ],
  [
    'db-schema-mismatch',
    'The stored database tables do not match their declared schema.',
  ],
  [
    'duplicate-operation-index',
    'Operation positions must be unique, strictly increasing nonnegative safe integers.',
  ],
  [
    'external-contract-kind-mismatch',
    "The contract's execution kind does not match the requested ordinary or external invocation.",
  ],
  [
    'external-contract-required',
    'A recorded external outcome requires a contract with an external execution declaration.',
  ],
  [
    'external-outcome-required',
    'External contract evaluation requires its previously recorded external outcome.',
  ],
  [
    'fanout-subscriber-cursor-failed',
    "The fanout subscriber's committed delivery cursor could not be read.",
  ],
  [
    'identity-aggregate-unavailable',
    'The requested Aggregate release is unavailable. Refresh the page to load the latest app. If the error persists, this app bundle may be incompatible with the server deployment.',
  ],
  [
    'mock-session-definition-unsupported',
    'Mock browser sessions support only aggregate and service session definitions.',
  ],
  [
    'mock-session-resource-model-invalid',
    'A mock resource references a model outside the session definition.',
  ],
  [
    'mock-session-transport-unsupported',
    'This mock session cannot hand staged commands to a connected transport.',
  ],
  [
    'native-session-disposed',
    'The native session has been disposed and cannot accept further operations.',
  ],
  [
    'native-session-storage-reset-required',
    "The native session's stored schema is incompatible and requires an explicit storage reset.",
  ],
  [
    'native-session-unavailable',
    'The native session has no active initialized replica for this operation.',
  ],
  [
    'node-acceptance-records-invalid',
    'The Node acceptance receipt is empty or contains commands outside the submitted page.',
  ],
  [
    'node-acceptance-records-not-imported',
    'The session did not import every command acknowledged by the Node.',
  ],
  [
    'node-admission-conflict',
    'The admitted command does not match the command retained at its push position.',
  ],
  [
    'node-admission-history-conflict',
    "The server's expected push position is outside this Node's retained submission history.",
  ],
  [
    'node-admission-identity-mismatch',
    'The submitted command identity differs from the command already admitted at that position.',
  ],
  [
    'node-producer-not-registered',
    'The local development System has no registration for this Node.',
  ],
  [
    'node-reset-journal-discard-failed',
    'The old Node journal could not be cleared during local reset recovery.',
  ],
  [
    'node-admission-index-mismatch',
    'The command is not at the next expected submission position for this Node.',
  ],
  [
    'node-admission-rejected',
    "The server rejected admission of the Node's pending command.",
  ],
  [
    'node-admission-reply-mismatch',
    'The command admission reply does not match the pending submission.',
  ],
  [
    'node-admission-result-invalid',
    'The command admission result does not satisfy the expected receipt shape.',
  ],
  [
    'node-admission-unavailable',
    'The Node cannot currently obtain command admission from the backend.',
  ],
  [
    'node-admission-uncertain',
    'The Node did not receive a definitive command admission response before the deadline.',
  ],
  [
    'node-attachment-identity-mismatch',
    'The attachment identity does not match the persistent Node owned by this worker.',
  ],
  [
    'node-authentication-cancelled',
    'The Node authentication attempt was cancelled before verification completed.',
  ],
  [
    'node-authentication-identity-mismatch',
    'The authenticated session identity does not match the Node requested by this worker.',
  ],
  [
    'node-authentication-rejected',
    'The backend rejected the credentials offered by the attached sessions.',
  ],
  [
    'node-baseline-already-initialized',
    'The Node already has an initialized baseline and cannot initialize it again.',
  ],
  [
    'node-baseline-checkpoint-invalid',
    'The replacement baseline does not contain a valid checkpoint for a fresh Node.',
  ],
  [
    'node-baseline-missing',
    'The Node has no verified baseline from which to initialize its resources and checkpoint.',
  ],
  [
    'node-checkpoint-conflict',
    'The shared worker Node cannot resume from its saved checkpoint. The server history for this identity may have been reset or replaced.',
  ],
  [
    'node-closed',
    'The Node is closing or closed and cannot accept further operations.',
  ],
  [
    'node-command-final-missing',
    'The Node journal is missing the completed command required by this record.',
  ],
  [
    'node-command-identity-mismatch',
    "The command identity does not match the Node's admitted session definition.",
  ],
  [
    'node-command-input-missing',
    'The Node journal is missing the original input required to submit this command.',
  ],
  [
    'node-command-invalid',
    "The command does not satisfy the Node's expected command shape.",
  ],
  [
    'node-command-preparation-failed',
    'The staged session command could not be prepared for Node acceptance.',
  ],
  [
    'node-command-staging-missing',
    'The pending command is missing the local staging data required for Node acceptance.',
  ],
  [
    'node-connection-failed',
    'The browser could not initialize or retain its shared worker Node connection.',
  ],
  [
    'node-connection-release-failed',
    'The browser could not completely release its shared worker connection.',
  ],
  [
    'node-connection-unavailable',
    'The browser cannot establish or retain its connection to the shared worker Node.',
  ],
  [
    'node-definition-session-mismatch',
    'The Node definition lock names a different session than the requested attachment.',
  ],
  [
    'node-discovery-blocked',
    "The browser's persistent Node identity database could not open because another connection blocked it.",
  ],
  [
    'node-discovery-incomplete',
    'The persistent Node identity lookup completed without producing a result.',
  ],
  [
    'node-epoch-changed',
    'The attached worker replaced its Node without an acknowledged replica reset.',
  ],
  [
    'node-execution-checkpoint-invalid',
    'The completed command does not contain a valid execution position and dispositionChainHash.',
  ],
  [
    'node-execution-gap',
    "The completed command does not continue the Node's retained execution checkpoint.",
  ],
  [
    'node-history-page-invalid',
    'The Node history request contains an invalid cursor or page limit.',
  ],
  [
    'node-index-invalid',
    "The Node's append or push counter is outside the valid safe integer range.",
  ],
  ['node-metadata-missing', 'The persistent Node metadata row is missing.'],
  [
    'node-offline',
    'The Node has no open backend connection for this operation.',
  ],
  [
    'node-offline-claims-required',
    'Offline Node discovery requires the expected claims for the requested session identity.',
  ],
  [
    'node-offline-identity-ambiguous',
    'More than one remembered Node matches this offline session identity.',
  ],
  [
    'node-offline-identity-missing',
    'Cannot reach the Zerospin server. No saved session matches this identity, so this session cannot open locally.',
  ],
  [
    'node-outcome-conflict',
    'The received command outcome conflicts with the outcome already retained by the Node.',
  ],
  [
    'node-outcome-gap',
    'The retained Node outcomes do not form a complete contiguous submission history.',
  ],
  [
    'node-persistence-failed',
    'The Node could not persist its command journal, resources, or checkpoint.',
  ],
  [
    'node-push-blocked',
    'The Node cannot submit commands while its retained work is blocked.',
  ],
  [
    'node-recovery-work-unconfirmed',
    'Your session was restored. Some local changes may not have been recovered. Check your latest changes before submitting them again.',
  ],
  [
    'node-recovery-caller-mismatch',
    'The retained recovery history contains outcomes from a different Node caller identity.',
  ],
  [
    'node-recovery-checkpoint-invalid',
    'The requested Node recovery checkpoint contains an invalid history position.',
  ],
  [
    'node-recovery-prefix-invalid',
    'The requested recovery cursor exceeds the contiguous outcomes retained for this Node.',
  ],
  [
    'node-replay-incomplete',
    "Replay finished without reaching the server's announced checkpoint and outcome position.",
  ],
  [
    'node-resource-invalid',
    "A retained Node resource does not satisfy its model's required resource shape.",
  ],
  [
    'node-resource-model-invalid',
    'A Node resource references an unavailable model or model version.',
  ],
  [
    'node-signed-out',
    "The Node's authenticated connection has stopped and cannot resume this operation.",
  ],
  [
    'node-snapshot-pending-ids-invalid',
    'Pending snapshot command IDs must be unique, valid command identifiers.',
  ],
  [
    'node-staging-blocked',
    'The Node cannot accept staged commands before initialization or while retained work is blocked.',
  ],
  [
    'node-state-required',
    'The server cannot continue this Node connection with its current identity, admission, or execution state.',
  ],
  [
    'node-storage-closed',
    "The Node's persistent storage is closing or closed.",
  ],
  [
    'node-storage-identity-mismatch',
    'The persistent Node storage belongs to a different session identity.',
  ],
  [
    'node-storage-incomplete',
    'The retained Node storage exists but has no completed baseline initialization.',
  ],
  [
    'node-storage-missing',
    'No persistent Node storage exists for this session identity.',
  ],
  [
    'node-storage-runtime-unavailable',
    'Session storage could not load. Check your connection and try again.',
  ],
  [
    'node-storage-reset-required',
    'The persistent Node schema is incompatible with this runtime and requires a storage reset.',
  ],
  ['node-subscription-closed', 'The Node subscription closed.'],
  [
    'node-subscription-cursor-invalid',
    "The subscription cursor is outside the Node's retained command history.",
  ],
  [
    'node-subscription-message-invalid',
    'The backend sent a message that is invalid for the current Node subscription.',
  ],
  [
    'node-subscription-timeout',
    'The Node subscription did not finish initialization and replay within 15 seconds.',
  ],
  [
    'node-synchronization-failed',
    'The Node could not complete synchronization with the backend.',
  ],
  [
    'node-synchronization-blocked',
    'The Node cannot synchronize while its retained work is blocked.',
  ],
  [
    'node-tab-detached',
    'This tab is no longer attached to the shared worker Node.',
  ],
  [
    'node-worker-name-invalid',
    'The shared worker name does not match the expected version and session identity format.',
  ],
  [
    'node-worker-version-mismatch',
    'The shared worker protocol version does not match this browser runtime.',
  ],
  [
    'outbox-acknowledgement-failed',
    'The delivered outbox page could not be durably acknowledged.',
  ],
  [
    'outbox-delivery-unavailable',
    'The outbox destination is temporarily unavailable for delivery.',
  ],
  [
    'outbox-diagnostic-write-failed',
    'The outbox delivery failure could not be recorded in persistent storage.',
  ],
  [
    'outbox-read-failed',
    'The outbox could not read its retained pending work.',
  ],
  [
    'outbox-source-inactive',
    'The outbox source is no longer active for this delivery.',
  ],
  [
    'outbox-source-replaced',
    'The outbox source was replaced and its previous delivery capability is retired.',
  ],
  [
    'pending-command-actor-mismatch',
    'The pending command belongs to a different actor name or version.',
  ],
  [
    'pending-command-business-failure',
    'The pending command was refused by its declared business rules during replay.',
  ],
  [
    'pending-command-contract-missing',
    'The contract required to replay the pending command is unavailable.',
  ],
  [
    'pending-command-input-missing',
    'The pending command lacks the immutable input required for replay.',
  ],
  [
    'pending-command-origin-mismatch',
    "The pending command's origin does not match the current session identity.",
  ],
  [
    'program-must-be-synchronous',
    'Programs and their capabilities must complete synchronously.',
  ],
  [
    'projection-command-invalid',
    "The delivered command does not satisfy the projection's expected occurrence shape.",
  ],
  [
    'projection-disposition-chain-hash-mismatch',
    "The projection's computed dispositionChainHash differs from the retained command history.",
  ],
  [
    'projection-operation-invalid',
    'The command contains an invalid operation for this projection.',
  ],
  [
    'projection-operation-model-mismatch',
    'The projected operation identifies a model or version outside the projection declaration.',
  ],
  [
    'projection-projected-resource-invalid',
    'A selected projection resource is invalid or omits a required visible reference.',
  ],
  [
    'projection-result-index-gap',
    'The projection result does not continue the next expected execution position.',
  ],
  [
    'projection-retained-occurrence-conflict',
    'The delivered occurrence conflicts with the occurrence retained at that projection position.',
  ],
  [
    'projection-retained-occurrence-missing',
    'The projection is missing an occurrence required by its retained checkpoint.',
  ],
  [
    'projection-state-identity-mismatch',
    'The requested projection state belongs to a different owner or view identity.',
  ],
  [
    'public-async-command-forbidden',
    'Recorded asynchronous continuations cannot be submitted through the public command API.',
  ],
  [
    'repo-key-decode-failed',
    'The Durable Object name does not match its declared prefix and identity route.',
  ],
  [
    'repo-key-encode-failed',
    'The repository identity could not be formatted as its declared Durable Object name.',
  ],
  [
    'rpc-envelope-invalid',
    'The RPC response does not contain a valid success or failure envelope.',
  ],
  [
    'service-actor-target-mismatch',
    'The selected service actor identity does not match the requested actor capability.',
  ],
  [
    'service-admission-failed',
    'The service command could not be durably admitted.',
  ],
  [
    'service-admission-receipt-invalid',
    'The service admission receipt does not match the submitted command and its valid push position.',
  ],
  [
    'service-command-actor-forbidden',
    'The selected service actor is not permitted to invoke this contract.',
  ],
  [
    'service-command-capability-mismatch',
    "The service command does not match its caller's admitted actor capability.",
  ],
  [
    'service-command-identity-mismatch',
    'The service command differs from the retained command at its execution position.',
  ],
  [
    'service-command-owner-mismatch',
    'The service command belongs to a different service owner.',
  ],
  [
    'service-contract-unsupported',
    'The executing service release does not support the submitted contract.',
  ],
  [
    'service-contract-lineage-unsupported',
    'The recorded service actor contract does not support the submitted payload version lineage.',
  ],
  [
    'service-contract-version-unsupported',
    'The historical service contract declaration required by the admitted command is unavailable.',
  ],
  [
    'service-command-phase-invalid',
    "The service command cannot be delivered in the connection's current synchronization phase.",
  ],
  [
    'service-completion-producer-invalid',
    'The retained service completion has incomplete or invalid originating Node coordinates.',
  ],
  [
    'service-connection-admission-invalid',
    'The service connection has no matching retained admission for this request.',
  ],
  [
    'service-execution-gap',
    'The service command history is not contiguous with the retained execution checkpoint.',
  ],
  [
    'service-execution-index-invalid',
    'The service execution position must be a nonnegative safe integer.',
  ],
  [
    'service-execution-index-unavailable',
    'The requested service execution position exceeds the admitted command history.',
  ],
  [
    'service-initialization-failed',
    'The service replica could not complete its baseline initialization.',
  ],
  [
    'service-input-index-exhausted',
    'The service command position cannot advance beyond the safe integer range.',
  ],
  [
    'service-membership-reconciliation-failed',
    "The service actor's visible resource membership could not be reconciled.",
  ],
  [
    'service-committed-result-missing',
    'The committed service execution has no pending publication packet or retained execution history.',
  ],
  [
    'service-command-identity-invalid',
    'The delivered service command does not identify its complete immutable admitted input.',
  ],
  [
    'service-input-cursor-invalid',
    'The service input cursor must be a positive safe integer.',
  ],
  [
    'service-execution-packet-invalid',
    'The service execution packet does not satisfy its canonical retained shape.',
  ],
  [
    'service-execution-packet-order-invalid',
    'Service execution packets must have strictly increasing execution positions.',
  ],
  [
    'service-execution-packet-mismatch',
    'The service execution packet conflicts with retained execution history.',
  ],
  [
    'service-execution-packet-producer-invalid',
    'The service execution packet has incomplete originating Node coordinates.',
  ],
  [
    'service-execution-packet-model-invalid',
    'The service execution packet names an unavailable release model version.',
  ],
  [
    'service-execution-packet-operations-invalid',
    'The service execution packet has invalid canonical model operations.',
  ],
  [
    'service-execution-history-gap',
    'The service execution packet does not continue the next retained execution position.',
  ],
  [
    'service-original-command-missing',
    'The original service command is missing when its result is acknowledged.',
  ],
  [
    'service-original-delivery-invalid',
    'The delivered original service command does not match the admitted input.',
  ],
  [
    'service-original-receipt-identity-mismatch',
    'The service acknowledgement does not identify the retained original command.',
  ],
  [
    'service-original-receipt-invalid',
    'A service acknowledgement must contain exactly one complete original command result.',
  ],
  [
    'service-original-outcome-mismatch',
    "The service acknowledgement conflicts with the original command's retained outcome.",
  ],
  [
    'service-original-predecessor-pending',
    'The original service command cannot finalize before its admitted predecessor.',
  ],
  [
    'service-original-version-mismatch',
    'The original command belongs to a different service release version.',
  ],
  [
    'service-projection-checkpoint-invalid',
    'The service projection checkpoint contains an invalid execution position or dispositionChainHash.',
  ],
  [
    'service-projection-disposition-chain-hash-mismatch',
    "The service projection's computed dispositionChainHash differs from its retained history.",
  ],
  [
    'service-projection-resource-conflict',
    'The received service resource conflicts with the resource already retained by this projection.',
  ],
  [
    'service-projection-result-index-gap',
    'The service projection result does not continue the next expected execution position.',
  ],
  [
    'service-replay-command-pending',
    'Service replay requires a completed outcome for the retained command.',
  ],
  [
    'service-replay-enrollment-failed',
    'The service replay subscriber could not be enrolled durably.',
  ],
  [
    'service-replay-enrollment-missing',
    'The service release has no saved initialization watermark.',
  ],
  [
    'service-predecessor-history-missing',
    'The predecessor has not published the enrolled Service prefix.',
  ],
  [
    'service-result-checkpoint-invalid',
    'The service result checkpoint does not contain a valid position and command identity.',
  ],
  [
    'service-result-cursor-invalid',
    'The service result cursor must be a nonnegative safe integer.',
  ],
  [
    'service-result-index-invalid',
    'A service result requires a positive safe integer execution position.',
  ],
  [
    'service-resume-checkpoint-conflict',
    'The service connection cannot resume from the requested checkpoint in its retained history.',
  ],
  [
    'service-resume-phase-invalid',
    'The service connection cannot resume in its current synchronization phase.',
  ],
  [
    'service-session-checkpoint-conflict',
    "The service session's retained checkpoint conflicts with the received history.",
  ],
  [
    'service-session-command-index-gap',
    'The service session command history is missing the next expected position.',
  ],
  [
    'service-session-command-invalid',
    'The service session command does not satisfy its declared command shape.',
  ],
  [
    'service-session-contract-forbidden',
    'This contract is not permitted by the service session definition.',
  ],
  [
    'service-session-contract-unavailable',
    'The contract required by this service session is unavailable.',
  ],
  [
    'service-session-identity-invalid',
    'The service connection identity does not match its selected service, actor, and session.',
  ],
  [
    'service-session-lock-invalid',
    'The service session definition lock does not match the selected service actor and session.',
  ],
  [
    'service-session-not-ready',
    'The service session has no current initialized capability for staging or validation.',
  ],
  [
    'service-session-outcome-conflict',
    'The service command outcome conflicts with an outcome already retained by this session.',
  ],
  [
    'service-session-owner-unavailable',
    'The service release that owns this session is unavailable.',
  ],
  [
    'service-version-unsupported',
    'The requested service release version is unavailable in this system.',
  ],
  [
    'session-actor-mismatch',
    'The admitted actor name or version does not match the session definition.',
  ],
  [
    'session-aggregate-selection-mismatch',
    'The admitted claims select a different aggregate instance than the requested session.',
  ],
  ['session-failed', 'The session encountered an unexpected error.'],
  [
    'session-already-mounted',
    'The session is already mounted or being reset and cannot initialize again.',
  ],
  [
    'session-credentials-invalid',
    'The session credentials could not be obtained or validated for admission.',
  ],
  [
    'session-credentials-required',
    'Session initialization requires a credentials provider for the declared authentication policy.',
  ],
  [
    'session-initialization-canceled',
    'The session initialization was cancelled or replaced before it completed.',
  ],
  [
    'session-metadata-missing',
    'The local session metadata required by this replica is missing.',
  ],
  [
    'session-node-index-gap',
    "The session's Node command page is missing the next expected journal position.",
  ],
  [
    'session-node-index-invalid',
    "The session's requested Node cursor is invalid or inconsistent with its retained checkpoint.",
  ],
  [
    'session-node-index-regression',
    "The session's Node cursor cannot move behind its retained journal position.",
  ],
  [
    'session-node-record-conflict',
    'The Node journal position is already assigned to a different local session command.',
  ],
  [
    'session-node-record-invalid',
    'The received Node record has invalid journal, push, or command coordinates.',
  ],
  [
    'session-origin-mismatch',
    'The admitted command origin does not match the session definition.',
  ],
  [
    'session-replay-cursor-invalid',
    'Session replay requires valid ordered history cursors and the admitted Node context.',
  ],
  [
    'session-replay-gap',
    'The retained session replay history is missing the next expected command position.',
  ],
  [
    'session-snapshot-acknowledged-command-missing',
    'The replacement snapshot omits a local command already acknowledged by the Node.',
  ],
  [
    'session-snapshot-checkpoint-invalid',
    'The session snapshot contains an invalid Node or execution checkpoint.',
  ],
  [
    'session-snapshot-identity-conflict',
    'The snapshot belongs to a different session than the local replica metadata.',
  ],
  [
    'session-snapshot-pending-partition-invalid',
    "The snapshot's resolved and unresolved command partitions do not exactly match the requested pending commands.",
  ],
  [
    'session-snapshot-receipt-invalid',
    'A snapshot command receipt lies outside the captured Node or execution checkpoint.',
  ],
  [
    'session-staged-coordinate-conflict',
    "The acknowledged command coordinates differ from the session's retained staging coordinates.",
  ],
  [
    'session-staged-input-conflict',
    'The received command input differs from the immutable input already staged by this session.',
  ],
  [
    'session-websocket-admission-invalid',
    'The WebSocket admission does not match the declared session, actor, or claims.',
  ],
  [
    'standalone-authentication-unsupported',
    'Standalone sessions do not support backend authentication operations.',
  ],
  [
    'standalone-backend-unsupported',
    'Standalone sessions do not connect to a backend or request backend admission.',
  ],
  [
    'standalone-backup-parameter-invalid',
    'A standalone backup path parameter is missing or is not a string or number.',
  ],
  [
    'standalone-backup-path-invalid',
    'The standalone backup path must be a local absolute pathname without an origin.',
  ],
  [
    'standalone-capability-stale',
    'The standalone capability belongs to a Node that has since been replaced.',
  ],
  [
    'standalone-command-kind-invalid',
    'Standalone commands require Actor kind with the declared claims.',
  ],
  [
    'standalone-contract-invalid',
    'The standalone command does not identify an available ordinary contract version.',
  ],
  [
    'standalone-session-definition-missing',
    'The requested standalone session definition is unavailable in this worker.',
  ],
  [
    'standalone-initialization-required',
    'The standalone session must be initialized before it can be reset.',
  ],
  [
    'standalone-resource-model-invalid',
    'A standalone resource references a model outside the session definition.',
  ],
  [
    'standalone-shared-worker-required',
    'The standalone session requires a non-empty SharedWorker URL.',
  ],
  [
    'standalone-state-reset',
    'Your saved local document could not be restored and was reset to its initial state.',
  ],
  [
    'standalone-storage-identity-mismatch',
    'The standalone storage path or namespace belongs to a different declared identity.',
  ],
  [
    'standalone-storage-reset-required',
    'The standalone storage is incompatible with this operation and requires an authorized standalone reset.',
  ],
  [
    'standalone-worker-unavailable',
    'The standalone shared worker could not establish or retain its connection.',
  ],
  [
    'system-command-kind-invalid',
    'An administrative system command requires System kind without originating Node coordinates.',
  ],
]);
