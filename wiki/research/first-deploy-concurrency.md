# First-deploy concurrency and recovery

**Date** 2026-11-19

**Status** PR #176 bootstrap spike and 2026-11-20 laptop deploy tooling follow-up.

## Laptop deploy tooling, 2026-11-20

The current [handoff](../handoffs/2026-11-19-handoff-deploy-bootstrap-concurrency-spike.md)
uses one `zerospin deploy` invocation at a time from the laptop. The question
is whether an existing library provides first activation, recovery after a
lost response, and explicit promotion for that workflow.

### Cloudflare support

Cloudflare's beta API separates Worker creation, version upload, and traffic
activation. Its Durable Object documentation identifies a bootstrap
constraint. A version cannot bind a new Durable Object namespace that only
comes into existence when that version's migration is deployed. Cloudflare's
workaround deploys the migration first and adds the binding in a subsequent
version. This applies to the API and SDKs as well as Terraform. Zerospin's
initial System Worker binds its own `SystemRepo`, so the namespace constraint
still matters after removing the deployment lock.
[Cloudflare Durable Object bootstrap](https://developers.cloudflare.com/workers/platform/infrastructure-as-code/#considerations-with-durable-objects)
· [System Worker bindings](../../packages/dev-worker/src/makeWranglerConfig.ts#L123)

Wrangler's standard script upload creates a version and activates it in one
request. Its version commands separate later uploads from promotion and
support version tags. The deployment API sets versions and weights for one
Worker per request. An expected current deployment ID is absent from the
documented request.
[Cloudflare script upload](https://developers.cloudflare.com/workers/platform/infrastructure-as-code/#multipartform-data-upload-api)
· [Wrangler version commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/#versions)
· [Create Deployment API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/create/)

### Libraries that cover parts of the workflow

1. **Cloudflare's TypeScript SDK (`cloudflare`)** exposes the Worker and
   deployment APIs for direct calls from Node. It retries some connection
   and timeout errors by default. For a first upload or promotion whose
   outcome must be reconciled before reissuing it, configure
   `maxRetries: 0` for that call. `@distilled.cloud/cloudflare` is an
   Effect-native alternative at the same API level. The Workers SDK also
   has a `@cloudflare/deploy-helpers` package whose manifest describes it
   as internal, with a changing API.
   [Official SDK retries](https://github.com/cloudflare/cloudflare-typescript#retries)
   · [Distilled SDK](https://www.npmjs.com/package/@distilled.cloud/cloudflare)
   · [Deploy helpers manifest](https://github.com/cloudflare/workers-sdk/blob/main/packages/deploy-helpers/package.json)
2. **Alchemy** is the closest open-source example for restart recovery.
   It can save intermediate resource state on disk and recover observed
   cloud resources on the next run. Its Cloudflare provider uses ownership
   tags to recognize resources and reads back the active deployment and
   version after full uploads. It also pre-creates a stub Worker for
   dependency cycles, including declarations for its Durable Object
   classes. The stub path can retry the first script `PUT` on certain
   server errors. Its gradual rollout path ultimately uses Cloudflare's
   standard deployment call.
   [Alchemy state and lifecycle](https://alchemy.run/state-store/#state-and-lifecycle)
   · [Recovery and adoption](https://alchemy.run/infrastructure-as-code/resource-lifecycle/)
   · [Stub and retry implementation](https://github.com/alchemy-run/alchemy/blob/5e54b66d13b4edb7918dae29af33e305a99a1838/packages/cloudflare/src/Workers/WorkerProvider.ts#L5141-L5206)
   · [Deployment readback](https://github.com/alchemy-run/alchemy/blob/5e54b66d13b4edb7918dae29af33e305a99a1838/packages/cloudflare/src/Workers/WorkerProvider.ts#L4470-L4485)
   · [Ownership check](https://github.com/alchemy-run/alchemy/blob/5e54b66d13b4edb7918dae29af33e305a99a1838/packages/cloudflare/src/Workers/WorkerProvider.ts#L5476-L5482)
3. **Cloudflare's Terraform provider and the community Workers module**
   model a Worker, its uploaded version, and its deployment as distinct
   resources. The module's versioned mode passes the exact returned
   version ID to Cloudflare's deployment API. Terraform coordinates
   applies through the state backend's lock when supported. The provider's
   Worker deployment resource calls the same Cloudflare API and records
   the returned deployment in Terraform state.
   [Community module implementation](https://github.com/terraform-cf-modules/terraform-cloudflare-workers/blob/dabd430d43be8c686f26d0d452fdc363ee0ad281/modules/script/main.tf#L126-L189)
   · [Cloudflare provider implementation](https://github.com/cloudflare/terraform-provider-cloudflare/blob/main/internal/services/workers_deployment/resource.go#L58-L98)
   · [Terraform state locking](https://developer.hashicorp.com/terraform/language/state/locking)

### Recommendation for Zerospin

Keep Wrangler for packaging, version staging, and exact-version promotion.
Use the stable script upload for the ingress-closed first System Worker.
Borrow Alchemy's local operation record and provider readback for interrupted
uploads. Save a run tag before issuing the initial upload and record the
exact deployment and version IDs once Cloudflare confirms them. A rerun
checks those facts before publishing owner releases or the Agent Worker.
Keep an ambiguous upload pending until its outcome can be established.

The tools reviewed provide Cloudflare operations or manage resource state.
Zerospin supplies the `SystemSpec` preflight and acceptance, owner and Agent
verification, and ingress-last readiness sequence. This recommendation is
based on documentation and source inspection.
[Existing bootstrap readback](../../packages/cli/setup-app/src/admin/makeAdminCloudflareApi.ts#L121-L159)
· [CLI sequence](../../packages/cli/src/deploy/deployWranglerFn.ts)

## Required behavior

These requirements governed the PR #176 spike.

Two first invocations of `zerospin deploy` can discover the same absent stable
System Worker name. Exactly one bootstrap may become active before the first
application deployment. If the first CLI exits mid-bootstrap, a rerun must
either complete the same bootstrap safely or report where recovery is blocked.
If the first CLI was paused and later resumes, it must be unable to replace the
bootstrap or serving version installed in the meantime.
[First-deploy spike handoff](../handoffs/2026-11-19-handoff-deploy-bootstrap-concurrency-spike.md)

The simplest flow is one create-only provider call that takes the stable Worker
name and the complete bootstrap payload. On a conflict or an uncertain response,
read the provider's operation or deployment record and wait for the authenticated
`ProductionWorker` endpoint. Acquire the same deployment Durable Object in
bootstrap and serving versions, read the incumbent deployment again under that
lock, then publish owner Workers and continue deployment. A split reservation
and activation needs a way to complete the recorded intent or have Cloudflare
reject an activation from a superseded CLI. The deployment Durable Object is
reachable only after activation.
[CLI deployment flow](../../packages/cli/src/deploy/deployWranglerFn.ts)
· [Bootstrap spike handoff](../handoffs/2026-11-19-handoff-deploy-bootstrap-concurrency-spike.md)

## How other tools handle the first write

### AWS CloudFormation and CDK

**Direct creation.** The AWS CLI's `CreateStack` submits the unique stack name
within its account and Region together with the template and parameters.
CloudFormation starts provisioning after accepting the request, returns a stack
ID and operation ID, and rejects a duplicate name with `AlreadyExists`. The
loser can read the existing stack by name or ID and check its template and
parameters before treating it as the same request. After acceptance, a CLI
exit or pause only interrupts observation. A rerun can describe the stack or
wait for `CREATE_COMPLETE`. Reuse `ClientRequestToken` for a retry of the same
request and correlate its events. The service also documents
`TokenAlreadyExists`, so the retry code still needs to inspect the operation.
[CreateStack](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_CreateStack.html)
· [DescribeStacks](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_DescribeStacks.html)
· [GetTemplate](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_GetTemplate.html)
· [AWS CLI waiter](https://docs.aws.amazon.com/cli/latest/reference/cloudformation/wait/stack-create-complete.html)

**CDK's default path.** `cdk deploy` calls CloudFormation to create a change
set and then executes it. A first `CreateChangeSet` with type `CREATE` leaves
the stack in `REVIEW_IN_PROGRESS` and gives the prepared change set an ARN. If
the CLI stops there, a later invocation can inspect and execute that saved
change set by ARN. After execution CloudFormation owns provisioning and deletes
the stack's other change sets because they are stale. CDK exposes separate
`prepare-change-set` and `execute-change-set` modes. Preparing again with the
default CDK name can replace the earlier change set, so use the ARN to identify
the exact saved payload during recovery.
[CDK deploy modes](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-deploy.html)
· [CreateChangeSet](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_CreateChangeSet.html)
· [ExecuteChangeSet](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_ExecuteChangeSet.html)

### Terraform with S3 remote state

With `use_lockfile = true`, Terraform uses the existing S3 backend to create
`<state-key>.tflock` with `PutObject` and `If-None-Match: *`. Only the first
write to the absent lock key succeeds while the object exists. Terraform
therefore serializes cooperating applies to the same state, including the first
apply. During initialization of a new named workspace, the S3 backend itself
acquires this lock before writing the empty state.
[S3 backend locking](https://developer.hashicorp.com/terraform/language/backend/s3#state-locking)
· [S3 conditional write behavior](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html#conditional-write-behavior)
· [Terraform lock write](https://github.com/hashicorp/terraform/blob/v1.14.0/internal/backend/remote-state/s3/client.go#L346-L378)
· [Workspace initialization](https://github.com/hashicorp/terraform/blob/v1.14.0/internal/backend/remote-state/s3/backend_state.go#L179-L256)

An abrupt exit can leave the lock behind. `terraform force-unlock LOCK_ID`
removes an observed lock and leaves infrastructure as it was. Terraform's S3
backend documents manual S3 recovery if a new workspace never wrote its state.
The lock ID identifies the lock to remove. A paused CLI can still resume
provider calls after the lock is cleared, so clearing it while that CLI is
alive can produce two writers. Any resources created before state was saved
need reconciliation, such as importing a resource Terraform has yet to record.
[Terraform locking](https://developer.hashicorp.com/terraform/language/state/locking#force-unlock)
· [Force-unlock command](https://developer.hashicorp.com/terraform/cli/commands/force-unlock)
· [Missing-state recovery in the S3 backend](https://github.com/hashicorp/terraform/blob/v1.14.0/internal/backend/remote-state/s3/backend_state.go#L187-L218)
· [Import existing resources](https://developer.hashicorp.com/terraform/cli/import/usage)

### Kubernetes and Helm

A fixed-name `kubectl create -f deployment.yaml` sends the desired Deployment
spec in a create-only POST. Kubernetes commits the spec only if the name is
absent, and a concurrent create of the same Deployment gets `AlreadyExists`.
The Deployment controller observes the stored spec and creates the ReplicaSet
even if the accepted CLI exits. A rerun can verify the existing Deployment and
resume watching its rollout.
[Kubernetes names and creation](https://kubernetes.io/docs/reference/using-api/api-concepts/#object-names)
· [Conditional storage create](https://github.com/kubernetes/kubernetes/blob/v1.34.0/staging/src/k8s.io/apiserver/pkg/storage/etcd3/store.go#L279-L312)
· [Deployment controller](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rollover-aka-multiple-updates-in-flight)
· [Rollout status](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_rollout/kubectl_rollout_status/#synopsis)

A Helm 3 install with the default Secret driver creates a release record in
`pending-install` before the CLI starts the main chart installation. A second
CLI sees the release name in use or loses the Secret create. An abrupt exit
after that write can leave the release pending and block another install.
Upgrade also refuses a pending release. The CLI owns the remaining install
calls and the pending Secret can outlive it. Chart CRDs and optional namespace
creation can precede this guard.
[Helm default storage](https://docs.helm.sh/docs/v3/topics/advanced/#storage-backends)
· [Install sequence](https://github.com/helm/helm/blob/v3.19.0/pkg/action/install.go#L329-L414)
· [Release name check](https://github.com/helm/helm/blob/v3.19.0/pkg/action/install.go#L542-L568)
· [Release Secret creation](https://github.com/helm/helm/blob/v3.19.0/pkg/storage/driver/secrets.go#L147-L170)
· [Upgrade pending guard](https://github.com/helm/helm/blob/v3.19.0/pkg/action/upgrade.go#L218-L221)

## What a bootstrap hash can prove

A bundle hash can identify the bootstrap bytes in a version tag and help a
rerun recognize an upload. CDK uses asset hashes to identify and reuse asset
revisions. To compare the whole bootstrap intent, include effective bindings,
variables and Durable Object migration inputs along with the bundle in the
fingerprint. Keep the stable Worker name fixed. Use the Cloudflare version ID
and deployment ID to check which version is routed. A match on the hash proves
content identity within the hashed inputs. A delayed caller can still activate
those same bytes after a newer version becomes active unless Cloudflare or an
already-reachable coordinator prevents that activation. Kubernetes illustrates
how these roles fit together. The Deployment controller derives a repeatable
ReplicaSet name from the template hash, uses conditional creation to claim it,
and verifies the owner UID and template before reusing an existing ReplicaSet.
[CDK asset hashing](https://docs.aws.amazon.com/cdk/v2/guide/assets.html)
· [Kubernetes ReplicaSet creation and reuse](https://github.com/kubernetes/kubernetes/blob/v1.34.0/pkg/controller/deployment/sync.go#L196-L256)
· [Cloudflare versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
· [Zerospin bootstrap spike](../handoffs/2026-11-19-handoff-deploy-bootstrap-concurrency-spike.md)

## What the Cloudflare evidence supports

The stable multipart script `PUT` uploads and deploys in one call and accepts
Durable Object migration metadata. Cloudflare's standard Workers API mentions
the script ETag and `If-None-Match`. Its reference leaves the wildcard and
concurrent first writes unspecified. The beta Create Worker call rejects an
existing name and creates the Worker separately from activation. The Create
Deployment call exposes no expected incumbent deployment ID. Wrangler's
standard multipart deploy sends no conditional-write header, and its first
legacy Durable Object migration supplies no `old_tag`.
[Wrangler upload](https://github.com/cloudflare/workers-sdk/blob/main/packages/deploy-helpers/src/deploy/deploy.ts#L619-L639)
· [Wrangler migration metadata](https://github.com/cloudflare/workers-sdk/blob/main/packages/deploy-helpers/src/deploy/helpers/durable.ts#L59-L86)
· [Multipart script upload](https://developers.cloudflare.com/workers/platform/infrastructure-as-code/#multipartform-data-upload-api)
· [Upload Worker API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/)
· [Beta create flow](https://developers.cloudflare.com/workers/platform/infrastructure-as-code/#cloudflare-rest-api)
· [Create Deployment API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/create/)

Zerospinner already ran a related live experiment on November 17. On the
Workers for Platforms upload endpoint, a sequential duplicate with
`If-None-Match: *` got HTTP 412. When paired uploads carrying different bundles
raced against fresh names, both succeeded in three of four pairs. This result
applies to the tested dispatch namespace endpoint. The ordinary Workers
endpoint used by self-hosted Zerospin still needs its own concurrent and
delayed-write test. A sequential 412 is insufficient evidence for it.
[Zerospinner live experiment](https://github.com/morgs32/zerospin-cloud/blob/ee08ef2bad185140b3ed8e876cb9ad5a70fbfded/wiki/research/cloudflare-authority-create-and-version-test.md#L5-L11)

Once the lock endpoint answers, a resumed CLI can acquire the same Durable
Object and reread the active deployment. With a reservation and no running
version, there is nowhere to send that request. Cloudflare excludes Workers
that implement Durable Objects from Version URLs, and version override
requests only apply to versions already in the current deployment.
[Version URL limitations](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/#limitations)
· [Version override requirements](https://developers.cloudflare.com/workers/versions-and-deployments/version-overrides/)

## Choices for Zerospin

1. **Provision the stable Worker once, then use its lock.** This is the smallest
   self-hosted change if a setup step is acceptable. Bootstrap the
   ingress-closed `ProductionWorker` under one designated deployment job and
   verify its authenticated deployment endpoint. After that, every
   `zerospin deploy` goes to the existing lock before publishing owner Workers.
   GitHub Actions can run a single job at a time for a repository concurrency
   group keyed by account and Worker name. Every bootstrap writer must use
   that job, and if a job is interrupted during a provider write, reconcile
   that write before another job sends one.
   [GitHub Actions concurrency groups](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)

2. **Submit the first deploy to a service that already runs.** This gives a
   normal one-command first deploy for each System. The CLI uploads the
   immutable artifact and submits a deployment request. The service serializes
   requests for the same account and stable Worker name, owns the Cloudflare
   writes, and retains enough state for a rerun to check the same request.
   Zerospinner's hosted path already stages an artifact, submits
   `requestDeployment`, and records the lock and upload checkpoint in
   `CloudRepo`. It retains ownership when a provider outcome is uncertain.
   Self-hosted installs would need an equivalent service or a shared CI job
   with a durable record of uncertain writes.
   [Hosted deployment request](https://github.com/morgs32/zerospin-cloud/blob/ee08ef2bad185140b3ed8e876cb9ad5a70fbfded/apps/api/src/CliApi/deploySystemWorker.ts#L103-L146)
   · [CloudRepo lock](https://github.com/morgs32/zerospin-cloud/blob/ee08ef2bad185140b3ed8e876cb9ad5a70fbfded/apps/api/src/CloudRepo/CloudRepo.ts#L186-L204)
   · [Provider readback](https://github.com/morgs32/zerospin-cloud/blob/ee08ef2bad185140b3ed8e876cb9ad5a70fbfded/apps/api/src/CliApi/deployArtifact.ts#L90-L120)

3. **Use a remote lock if manual recovery is acceptable.** Cloudflare R2
   documents atomic create-only writes, so a preconfigured bucket can grant
   a bootstrap lock in the same way Terraform uses S3. A crashed CLI can
   leave the lock and its unfinished work behind. Keep the lock until the
   provider state is reconciled and the original attempt can no longer issue
   writes. An expiring lock alone cannot constrain Cloudflare's deployment
   API or make takeover safe.
   [R2 atomic conditional writes](https://developers.cloudflare.com/r2/reference/consistency/#conditional-writes)
   · [Terraform force unlock](https://developer.hashicorp.com/terraform/language/state/locking#force-unlock)
