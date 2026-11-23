import CryptoKit
import Foundation

/// A published, uncompressed System archive. The ZIP parser accepts only the
/// three regular files defined by the package format and never extracts paths.
public struct SystemPackage: Sendable {
  public struct Manifest: Decodable, Sendable {
    public let formatVersion: Int
    public let systemName: String
    public let bundleSha256: String
    public let systemSpecHash: String
  }

  public let manifest: Manifest
  public let bundle: String
  public let systemSpec: Data
  public let data: Data
  public let digest: String

  public init(data: Data) throws {
    let files = try Self.readArchive(data)
    guard let manifestData = files["manifest.json"], let bundleData = files["system.js"],
      let spec = files["system-spec.json"], let bundle = String(data: bundleData, encoding: .utf8)
    else { throw HostError.message("System package is missing a required file") }
    let manifest = try JSONDecoder().decode(Manifest.self, from: manifestData)
    guard manifest.formatVersion == 2 else {
      throw HostError.message("Unsupported System package format \(manifest.formatVersion); this app requires format 2")
    }
    guard !manifest.systemName.isEmpty,
      manifest.bundleSha256 == Self.sha256(bundleData),
      let systemSpec = try JSONSerialization.jsonObject(with: spec) as? [String: Any],
      systemSpec["hash"] as? String == manifest.systemSpecHash
    else { throw HostError.message("System package identity or digest is invalid") }
    self.manifest = manifest
    self.bundle = bundle
    self.systemSpec = spec
    self.data = data
    self.digest = Self.sha256(data)
  }

  private static func sha256(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  private static func readArchive(_ data: Data) throws -> [String: Data] {
    let maximumBytes = 64 * 1024 * 1024
    guard data.count >= 22, data.count <= maximumBytes else {
      throw HostError.message("System package size is invalid")
    }
    func u16(_ offset: Int) throws -> Int {
      guard offset >= 0, offset <= data.count - 2 else { throw HostError.message("Truncated System package") }
      return Int(data[offset]) | (Int(data[offset + 1]) << 8)
    }
    func u32(_ offset: Int) throws -> Int {
      try u16(offset) | (u16(offset + 2) << 16)
    }
    func bytes(_ offset: Int, _ count: Int) throws -> Data {
      guard offset >= 0, count >= 0, offset <= data.count, count <= data.count - offset else {
        throw HostError.message("Truncated System package")
      }
      return data.subdata(in: offset..<(offset + count))
    }
    let lowerBound = max(0, data.count - 65_557)
    var end: Int?
    for position in stride(from: data.count - 22, through: lowerBound, by: -1) {
      if try u32(position) == 0x06054b50, position + 22 + (try u16(position + 20)) == data.count {
        end = position
        break
      }
    }
    guard let end, try u16(end + 4) == 0, try u16(end + 6) == 0,
      try u16(end + 8) == 3, try u16(end + 10) == 3
    else { throw HostError.message("Unsupported System package directory") }
    let centralSize = try u32(end + 12)
    var cursor = try u32(end + 16)
    guard cursor <= end, centralSize == end - cursor else { throw HostError.message("Invalid System package directory") }
    let allowed: Set<String> = ["manifest.json", "system.js", "system-spec.json"]
    var files: [String: Data] = [:]
    for _ in 0..<3 {
      guard try u32(cursor) == 0x02014b50 else { throw HostError.message("Invalid System package entry") }
      let flags = try u16(cursor + 8)
      let compression = try u16(cursor + 10)
      let checksum = try u32(cursor + 16)
      let compressed = try u32(cursor + 20)
      let length = try u32(cursor + 24)
      let nameLength = try u16(cursor + 28)
      let extraLength = try u16(cursor + 30)
      let commentLength = try u16(cursor + 32)
      let local = try u32(cursor + 42)
      let nameBytes = try bytes(cursor + 46, nameLength)
      guard flags & 1 == 0, compression == 0, compressed == length,
        let name = String(data: nameBytes, encoding: .utf8), allowed.contains(name), files[name] == nil,
        try u32(local) == 0x04034b50, try u16(local + 6) == flags, try u16(local + 8) == compression
      else { throw HostError.message("Unsupported System package entry") }
      let localNameLength = try u16(local + 26)
      let localExtraLength = try u16(local + 28)
      guard try bytes(local + 30, localNameLength) == nameBytes else {
        throw HostError.message("System package filenames do not match")
      }
      let start = local + 30 + localNameLength + localExtraLength
      guard start <= (try u32(end + 16)), length <= (try u32(end + 16)) - start else {
        throw HostError.message("System package contents overlap its directory")
      }
      let content = try bytes(start, length)
      var crc: UInt32 = 0xffff_ffff
      for byte in content {
        crc ^= UInt32(byte)
        for _ in 0..<8 { crc = (crc >> 1) ^ (0xedb8_8320 & (0 &- (crc & 1))) }
      }
      guard Int(crc ^ 0xffff_ffff) == checksum else { throw HostError.message("System package checksum failed") }
      files[name] = content
      cursor += 46 + nameLength + extraLength + commentLength
    }
    guard cursor == end else { throw HostError.message("Invalid System package directory length") }
    return files
  }
}
