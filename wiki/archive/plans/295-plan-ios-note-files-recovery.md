# 295 — Zerospin iOS note recovery from Files

**Status** — Implemented and verified on 2026-11-10.

## Product behavior

1. On first launch, **Create new note** generates one reusable recovery key. The user saves it somewhere reachable from a replacement iPhone and confirms before the editor opens. The other first-launch action is **Restore from Files**.
2. **Save** commits the note to this iPhone. **Save backup to Files** exports an encrypted snapshot of the last saved text, with the default filename `Zerospin Note.zerospinbackup`. Zerospin shows **Backup saved to Files** after the system exporter succeeds.
3. On a fresh installation, **Restore from Files** opens the system picker. The user selects the backup and enters the recovery key. An incorrect key keeps the same backup selected and the restore form open. The correct key commits the note locally and opens the exact text in the editor. If the installation already has an unreadable local note, Zerospin asks before replacing it and commits the replacement only after validating the backup.

The first release uses a portable Files backup. The earlier CloudKit development attempt established that Xcode’s available Personal Team could not provision iCloud. The maintainer subsequently chose Files and the two-Simulator acceptance below. [Recovery research](../../research/ios-recovery-codes-and-encrypted-sqlite.md) · [Apple’s Files integration](https://developer.apple.com/documentation/FileProvider)

## Storage and recovery

1. `RecoveryKeyStore` generates a 32-byte key, presents it as grouped Base32, and stores it in a non-synchronizing, device-only Keychain item. Viewing the saved key again requires device-owner authentication.
2. `EncryptedNoteSnapshot` derives distinct local and portable encryption keys with HKDF-SHA256. It uses AES-GCM with a fresh nonce and an authenticated format version. The portable encrypted envelope has a 1 MiB limit. [CryptoKit AES.GCM](https://developer.apple.com/documentation/cryptokit/aes/gcm)
3. `NoteStore` keeps the working note encrypted in Application Support. It installs the Keychain item before atomically activating the encrypted note file. Import takes a bounded read of the selected file under a coordinated, security-scoped Files URL. It retains the encrypted bytes in memory for key retries and commits restored text only after authentication. [Apple’s file importer](https://developer.apple.com/documentation/swiftui/view/fileimporter%28ispresented%3Aallowedcontenttypes%3Aoncompletion%3A%29)

## Verification recorded on 2026-11-10

1. Xcode 27.2 built the Files app for iPhone Simulator. The built Info.plist declares the `com.zerospin.ios.note-backup` document type and `.zerospinbackup` extension. Swift formatting and project property-list validation passed.
2. On iPhone 17 Pro Simulator A, iOS 26.1, Zerospin started with an empty note store and no recovery key. I created a key, copied it, saved `Zero Spin Files check 295: north window, copper kettle, blue bicycle.`, and chose **Save backup to Files → On My iPhone**. Zerospin displayed **Backup saved to Files**.
3. The Mac copied only `Zerospin Note.zerospinbackup` into the local Files location on a fresh iPhone 17 Pro Simulator B, also running iOS 26.1. The 109-byte destination matched the export byte for byte. I selected it through Zerospin’s **Restore from Files** picker.
4. A correctly formatted wrong key left the restore form open and displayed **Couldn’t unlock this backup. Check your recovery key and try again.** Entering the original key in the same form opened the editor. Device Hub’s accessibility tree showed an exact match for the saved text and **Saved on this iPhone**. Both Simulators used local Files storage, with no iCloud sign-in or paid team.

## Implemented files

```text
zerospin/
├── ios/
│   ├── Zerospin.xcodeproj/
│   │   ├── project.pbxproj
│   │   └── xcshareddata/xcschemes/Zerospin.xcscheme
│   └── Zerospin/
│       ├── Info.plist
│       ├── ZerospinApp.swift
│       ├── OnboardingView.swift
│       ├── NoteEditorView.swift
│       ├── NoteStore.swift
│       ├── RecoveryKeyStore.swift
│       └── EncryptedNoteSnapshot.swift
└── wiki/
    └── glossary.md
```

## Remaining work

None.
