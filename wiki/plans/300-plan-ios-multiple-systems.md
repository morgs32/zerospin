# Multiple Systems in the Zerospin iPhone app

> Relevant remaining work is tracked in [MOR-467](https://linear.app/morganatwork/issue/MOR-467/verify-signed-multi-system-iphone-hosting-and-icloud-restore). This file preserves the source plan and its evidence.

Status: Implementation complete; verification in progress.

## Problem and decisions

1. The iPhone app currently installs one trusted System package and retains one iCloud backup. Show a list of installed Systems, with one installation per case-insensitive GitHub `owner/repository` and an Add action using the existing public GitHub Release picker.
2. Selecting a System opens its existing command console. Give each System independent local storage, runtime lifecycle, backup status and CloudKit backup; restore all available Systems with individual retryable failures.
3. Upgrade the existing installation and singleton backup without changing its System ID, package, retained command history or model data. Keep the original CloudKit backup until the per-System backup is verified; treat both records for the same System as one and prefer the newer valid snapshot. Do not reset storage.
4. Keep the existing iCloud account checks, backup conflict protection, package inspection and staged storage validation. Restore existing backups before installing on a replacement iPhone. Trusted packages, one command-writing device, public repositories and the existing System runtime limits remain in scope; repository renames, removal, private repositories, releases upgrades and multi-device reconciliation do not.
5. Per-System backups were chosen over a combined snapshot so one System's upload failure does not prevent another System's backup. The existing package format and runtime are retained.

## Implementation and verification

1. Implement list navigation, installation selection and the System console; isolate runtime and backup state by System ID.
2. Discover, verify and restore per-System CloudKit records alongside the legacy record; make local upgrade and interrupted restore safely resumable without overwriting installations.
3. Build the iOS app using the existing scheme. On signed devices or simulators, install two Systems, switch consoles and verify independent data, backup status and case-insensitive duplicate rejection.
4. Verify existing installation upgrade and legacy/new backup deduplication, then restore multiple Systems and exercise an interrupted or failed backup and restore. Preserve all existing data.
5. Update the native host architecture and reconcile glossary terms with the implemented result. Create an ADR only if an implemented decision is hard to reverse, surprising without context and involves a real trade-off.

Planned files: `+` creates and `~` modifies.

```text
zerospin/
├── ios/Zerospin/
│   ├── ~ ZerospinApp.swift
│   ├── ~ SystemStore.swift
│   └── ~ SystemBackup.swift
└── wiki/
    ├── + plans/300-plan-ios-multiple-systems.md
    ├── ~ architecture/NativeSystemHost.md
    └── ~ glossary.md
```

## Remaining work

1. The iOS simulator build passed, and an isolated unsigned installation launched under a separate app identifier. Device Hub showed the empty Systems list, the Add System screen, accurate unavailable-iCloud guidance, and the published Tic-Tac-Toe release returned by GitHub. Navigation to installed Systems still needs signed end-to-end verification.
2. Verify two public GitHub System packages, case-insensitive duplicate rejection, independent command data and backup status, and replacement-device restoration with a provisioned signed app. The unsigned app discovered releases from both repositories, and a signed simulator build passed. Both actual release packages ran in separate macOS `SystemRuntime` storage directories: their commands retained successful `outcome` values, and each System retained its own data after both runtimes were closed and reopened. This does not establish the iPhone list or iCloud restore. No separate iCloud account was found among existing simulators. Restoring through the shared account would publish a new per-System backup and can cause the physical iPhone's older local copy to show a conflict; user direction is pending before doing so.
3. Verify this implementation's legacy local upgrade, legacy/per-System backup deduplication, and interrupted or failed backup and restore against signed iCloud. A parallel verification restored the previous singleton backup on an isolated simulator clone and checked both items, both successful admitted commands, the package digest, and four SQLite integrity checks. That historical restore attempted its normal post-restore upload at sequence 11, but server acknowledgement was not independently verified; the physical iPhone's earlier local revision may therefore be stale. Preserve both copies. The parallel chat is still checking the multi-System failure paths.
4. Confirm the CloudKit `SystemBackups` custom zone and `SystemBackupCatalog.systemIds` schema are available in the intended environment, and exercise the full multi-System flow end to end. A parallel isolated CloudKit failure probe observed stale-revision and stale-change-tag rejection and a failed restore that preserved a separate usable System. It did not establish account-switch fencing: checks before and after CloudKit calls do not atomically prevent a save in a changed account. A proposed anchor-owner check was rejected because CloudKit's `creatorUserRecordID` did not match `container.userRecordID()` for the simulator's own records; the parallel chat is investigating.
5. The parallel chat observed that specifying the bound account's `userRecordID` as the `CKRecordZone.ID` owner allowed isolated Development default-zone reads and custom-zone writes; a fake owner failed, including for a dummy asset. This is preliminary evidence for a record-commit fence, not an actual second-account test or proof about transient asset transfer. The account-switch design remains unsettled.
