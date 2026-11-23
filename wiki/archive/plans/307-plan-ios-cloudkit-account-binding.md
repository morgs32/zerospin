# Pin iOS System backups to their Apple Account

## Goal

Address every CloudKit backup request to the Apple Account bound to the System, so an account change cannot commit its backup record to another account's private database.

## Implementation

1. Derive the custom zone, catalog, and System record IDs from the opaque account identifier passed to each `SystemBackupStore` operation. Reject missing or dynamic owner identities and validate returned IDs before use.
2. Preserve existing account checks, conditional saves, atomic publication, stale-revision handling, and local backup retry. Do not change the storage schema or existing CloudKit records.
3. Update native-host and research documentation to describe implemented behavior and the limits of CloudKit account-switch and asset-transfer evidence. Reconcile the glossary and add an ADR only if the final decision qualifies.

## Verification

1. Run a signed iOS build and the authorized temporary isolated CloudKit checks against final source: explicit-owner asset reads and writes, fake-owner rejection, stale revisions, conditional saves, and failed restore while preserving existing data.
2. If a second Apple Account is available on an isolated installation, verify an A-addressed request while B is active cannot commit a record in B; separately report whether an actual in-flight account switch was reproduced.
3. Confirm normal backup and restore with the original account. Do not treat earlier tests against different source revisions as final implementation verification.

## Outcome

1. Signed iPhone and simulator builds passed. A signed, isolated Mac harness exercised the final production CloudKit and SystemStore code against a disposable zone and local root. Explicit-owner asset publication, discovery and revision reads passed; dynamic and fake owners, stale revisions and a stale CloudKit change tag were rejected. An invalid staged restore preserved a byte-identical System that reopened successfully. The disposable zone and local root were deleted.
2. The user has no second Apple Account, so an actual A-to-B switch was not tested. The checks also did not observe any transient asset bytes before CloudKit rejected a record. Neither outcome is inferred from the fake-owner check.

## Remaining work

None.
