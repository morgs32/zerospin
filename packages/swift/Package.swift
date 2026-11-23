// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "Zerospin",
  platforms: [.iOS(.v17), .macOS(.v14)],
  products: [.library(name: "Zerospin", targets: ["Zerospin"])],
  targets: [
    .target(
      name: "Zerospin", resources: [.process("Resources")],
      linkerSettings: [.linkedLibrary("sqlite3")]),
  ]
)
