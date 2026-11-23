import CloudKit
import Combine
import SwiftUI
import UIKit

@main
struct ZerospinApp: App {
  private enum Route: Hashable { case add, system(String) }
  @State private var store = SystemStore()
  @State private var path: [Route] = []
  @Environment(\.scenePhase) private var scenePhase

  var body: some Scene {
    WindowGroup {
      NavigationStack(path: $path) {
        systemsView
        .navigationDestination(for: Route.self) { route in
          switch route {
          case .add:
            installView.navigationTitle("Add System")
          case .system:
            consoleView.navigationTitle(store.inspection?.systemName ?? "System")
          }
        }
      }
      .overlay { if store.isBusy { ProgressView().padding().background(.regularMaterial).clipShape(.rect(cornerRadius: 12)) } }
      .disabled(store.isBusy)
      .alert("Zerospin", isPresented: Binding(
        get: { store.error != nil }, set: { if !$0 { store.error = nil } }
      )) { Button("OK") { store.error = nil } } message: { Text(store.error ?? "") }
      .task { await store.open() }
      .onChange(of: scenePhase) { _, phase in
        if phase == .active { Task { await store.foreground() } }
      }
      .onReceive(NotificationCenter.default.publisher(for: .CKAccountChanged).receive(on: DispatchQueue.main)) { _ in
        Task { await store.accountChanged() }
      }
      .onChange(of: path) { _, newPath in
        if !newPath.contains(where: { if case .system = $0 { true } else { false } }), store.selectedSystemId != nil {
          Task { await store.closeSystem() }
        }
      }
    }
  }

  private var systemsView: some View {
    List {
      Section("Systems") {
        if store.systems.isEmpty {
          Text("No Systems installed yet.").foregroundStyle(.secondary)
        }
        ForEach(store.systems) { system in
          Button {
            Task {
              await store.selectSystem(id: system.id)
              if store.selectedSystemId == system.id { path.append(.system(system.id)) }
            }
          } label: {
            VStack(alignment: .leading, spacing: 4) {
              Text(system.systemName)
              Text(system.repository).font(.caption).foregroundStyle(.secondary)
              Text(system.backupStatus).font(.caption).foregroundStyle(.secondary)
            }
          }
        }
      }
      Section("iCloud recovery") {
        Button("Check iCloud for backups") { Task { await store.checkCloud() } }
        if store.hasBackup && store.hasCheckedCloudAccount {
          Button("Restore all Systems from iCloud") { Task { await store.restore() } }
          Text("Restore on a replacement iPhone. The original iPhone will not be stopped automatically.")
            .font(.footnote).foregroundStyle(.secondary)
        }
        Text(store.backupStatus).font(.footnote).foregroundStyle(.secondary)
        ForEach(store.restoreFailures.indices, id: \.self) { index in
          Text(store.restoreFailures[index]).font(.footnote).foregroundStyle(.secondary)
        }
      }
    }
    .navigationTitle("Systems")
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button("Add System", systemImage: "plus") { path.append(.add) }
      }
    }
  }

  private var installView: some View {
    Form {
      Section("Install a System") {
        TextField("https://github.com/owner/repository", text: $store.repository)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .keyboardType(.URL)
        Button("Find releases") { Task { await store.findReleases() } }
        Text("Install only a System you trust. Its code runs with access to its data.")
          .font(.footnote).foregroundStyle(.secondary)
        if !store.canInstallSystem {
          Text(store.hasBackup && store.hasCheckedCloudAccount ? "Restore iCloud Systems or resolve backup issues before installing another." : "A successful iCloud backup check is required before installation.")
            .font(.footnote).foregroundStyle(.secondary)
        }
      }
      if !store.releases.isEmpty {
        Section("Choose a release") {
          if store.hasBackup && store.hasCheckedCloudAccount {
            Text("Restore iCloud Systems or resolve backup issues before installing another System.")
              .font(.footnote).foregroundStyle(.secondary)
          } else if !store.canInstallSystem {
            Text("Check iCloud for an existing backup before installing a System.")
              .font(.footnote).foregroundStyle(.secondary)
          }
          ForEach(store.releases) { release in
            Button {
              Task {
                let count = store.systems.count
                await store.install(release)
                if store.systems.count > count { path = [] }
              }
            } label: {
              VStack(alignment: .leading) {
                Text(release.name?.isEmpty == false ? release.name! : release.tag_name)
                Text(release.prerelease ? "\(release.tag_name) · Prerelease" : release.tag_name)
                  .font(.caption).foregroundStyle(.secondary)
              }
            }.disabled(!store.canInstallSystem)
          }
        }
      }
    }
    .onChange(of: store.repository) { store.releases = [] }
  }

  private var consoleView: some View {
    Form {
      if let inspection = store.inspection {
        Section("System") {
          LabeledContent("Name", value: inspection.systemName)
          LabeledContent("Aggregate", value: "\(inspection.aggregateName)@\(inspection.aggregateVersion)")
        }
        Section("Run command") {
          TextField("Aggregate ID", text: Binding(
            get: { store.aggregateId },
            set: { value in
              if store.aggregateId != value {
                store.aggregateId = value
                store.outcome = ""
                store.resources = ""
              }
            }
          ))
            .textInputAutocapitalization(.never).autocorrectionDisabled()
          Picker("Command", selection: $store.commandName) {
            ForEach(inspection.commands) { command in
              Text("\(command.name)@\(command.version)").tag(command.name)
            }
          }
          Text("Payload (JSON)").font(.caption).foregroundStyle(.secondary)
          JSONEditor(text: $store.payload).frame(minHeight: 110)
          Button("Run command") { Task { await store.execute() } }
            .disabled(store.aggregateId.isEmpty || store.commandName.isEmpty)
          Button("Refresh data") { Task { await store.refreshResources() } }
            .disabled(store.aggregateId.isEmpty)
        }
      }
      if !store.recoveryFailures.isEmpty {
        Section("Admitted commands awaiting recovery") {
          ForEach(store.recoveryFailures) { failure in
            VStack(alignment: .leading, spacing: 6) {
              Text("Aggregate \(failure.aggregateId) · index \(failure.aggregateIndex)")
              Text(failure.commandId).font(.caption).textSelection(.enabled)
              Text(failure.message).font(.caption).foregroundStyle(.secondary)
            }
          }
          Text("The displayed commands have no retained outcome. New commands for those Aggregates are paused until recovery succeeds.")
            .font(.footnote).foregroundStyle(.secondary)
        }
      }
      if !store.outcome.isEmpty {
        Section("Command outcome") { Text(store.outcome).font(.system(.caption, design: .monospaced)).textSelection(.enabled) }
      }
      if !store.resources.isEmpty {
        Section("Stored data") { Text(store.resources).font(.system(.caption, design: .monospaced)).textSelection(.enabled) }
      }
      Section("iCloud backup") {
        Text(store.backupStatus).font(.footnote)
        Button("Retry backup") { Task { await store.retryBackup() } }
      }
    }
  }
}

/// JSON needs literal quotes and dashes rather than iOS smart punctuation.
private struct JSONEditor: UIViewRepresentable {
  @Binding var text: String

  func makeCoordinator() -> Coordinator { Coordinator(text: $text) }

  func makeUIView(context: Context) -> UITextView {
    let view = UITextView()
    view.delegate = context.coordinator
    view.font = .monospacedSystemFont(ofSize: 16, weight: .regular)
    view.backgroundColor = .clear
    view.autocapitalizationType = .none
    view.autocorrectionType = .no
    view.smartQuotesType = .no
    view.smartDashesType = .no
    view.accessibilityLabel = "Payload JSON"
    return view
  }

  func updateUIView(_ view: UITextView, context: Context) {
    if view.text != text { view.text = text }
  }

  final class Coordinator: NSObject, UITextViewDelegate {
    @Binding var text: String
    init(text: Binding<String>) { _text = text }
    func textViewDidChange(_ textView: UITextView) { text = textView.text }
  }
}
