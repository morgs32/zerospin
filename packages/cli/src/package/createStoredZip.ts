import { Buffer } from 'node:buffer';

function crc32(content: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of content) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

/** Create a bounded, uncompressed ZIP readable without a third-party decoder. */
export function createStoredZip(
  files: Readonly<Record<string, Uint8Array>>,
): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const name of Object.keys(files)) {
    const content = files[name];
    if (content === undefined) {
      throw new Error(`Missing ZIP entry: ${name}`);
    }
    const filename = Buffer.from(name, 'utf8');
    if (filename.length > 0xffff || content.byteLength > 64 * 1024 * 1024) {
      throw new Error(`ZIP entry exceeds package limits: ${name}`);
    }
    const checksum = crc32(content);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0x21, 12);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(content.byteLength, 18);
    header.writeUInt32LE(content.byteLength, 22);
    header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, Buffer.from(content));

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(content.byteLength, 20);
    entry.writeUInt32LE(content.byteLength, 24);
    entry.writeUInt16LE(filename.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, filename);
    offset += header.length + filename.length + content.byteLength;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  const archive = Buffer.concat([...local, directory, end]);
  if (archive.length > 64 * 1024 * 1024) {
    throw new Error('System package exceeds 64 MiB');
  }
  return archive;
}
