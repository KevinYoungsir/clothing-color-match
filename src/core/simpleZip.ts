export type ZipFileEntry = {
  name: string;
  blob: Blob;
};

type PreparedZipEntry = {
  nameBytes: Uint8Array;
  data: Uint8Array;
  crc: number;
  localHeaderOffset: number;
};

const textEncoder = new TextEncoder();
const utf8Flag = 0x0800;
const storedMethod = 0;

function createCrcTable() {
  const table = new Uint32Array(256);

  for (let index = 0; index < table.length; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}

const crcTable = createCrcTable();

function calculateCrc32(data: Uint8Array) {
  let crc = 0xffffffff;

  for (let index = 0; index < data.length; index += 1) {
    crc = crcTable[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function getDosTimestamp() {
  const now = new Date();
  const year = Math.max(1980, now.getFullYear());
  const dosTime =
    (now.getHours() << 11) |
    (now.getMinutes() << 5) |
    Math.floor(now.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  return { dosDate, dosTime };
}

function createHeader(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  const view = new DataView(bytes.buffer);

  return { bytes, view };
}

function toArrayBuffer(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  return buffer;
}

function writeLocalHeader(entry: PreparedZipEntry, dosTime: number, dosDate: number) {
  const { bytes, view } = createHeader(30 + entry.nameBytes.length);

  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, utf8Flag, true);
  view.setUint16(8, storedMethod, true);
  view.setUint16(10, dosTime, true);
  view.setUint16(12, dosDate, true);
  view.setUint32(14, entry.crc, true);
  view.setUint32(18, entry.data.length, true);
  view.setUint32(22, entry.data.length, true);
  view.setUint16(26, entry.nameBytes.length, true);
  view.setUint16(28, 0, true);
  bytes.set(entry.nameBytes, 30);

  return bytes;
}

function writeCentralDirectoryHeader(entry: PreparedZipEntry, dosTime: number, dosDate: number) {
  const { bytes, view } = createHeader(46 + entry.nameBytes.length);

  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, utf8Flag, true);
  view.setUint16(10, storedMethod, true);
  view.setUint16(12, dosTime, true);
  view.setUint16(14, dosDate, true);
  view.setUint32(16, entry.crc, true);
  view.setUint32(20, entry.data.length, true);
  view.setUint32(24, entry.data.length, true);
  view.setUint16(28, entry.nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, entry.localHeaderOffset, true);
  bytes.set(entry.nameBytes, 46);

  return bytes;
}

function writeEndOfCentralDirectory(entryCount: number, centralDirectorySize: number, centralDirectoryOffset: number) {
  const { bytes, view } = createHeader(22);

  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);

  return bytes;
}

export async function createZipBlob(files: ZipFileEntry[]) {
  const preparedEntries: PreparedZipEntry[] = [];
  let offset = 0;

  for (const file of files) {
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const nameBytes = textEncoder.encode(file.name);

    preparedEntries.push({
      crc: calculateCrc32(data),
      data,
      localHeaderOffset: offset,
      nameBytes
    });

    offset += 30 + nameBytes.length + data.length;
  }

  const { dosDate, dosTime } = getDosTimestamp();
  const chunks: BlobPart[] = [];

  preparedEntries.forEach((entry) => {
    chunks.push(toArrayBuffer(writeLocalHeader(entry, dosTime, dosDate)), toArrayBuffer(entry.data));
  });

  const centralDirectoryOffset = offset;
  let centralDirectorySize = 0;

  preparedEntries.forEach((entry) => {
    const header = writeCentralDirectoryHeader(entry, dosTime, dosDate);
    centralDirectorySize += header.length;
    chunks.push(toArrayBuffer(header));
  });

  chunks.push(
    toArrayBuffer(writeEndOfCentralDirectory(preparedEntries.length, centralDirectorySize, centralDirectoryOffset))
  );

  return new Blob(chunks, { type: "application/zip" });
}
