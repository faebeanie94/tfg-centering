/**
 * Minimal ZIP writer (store method, no compression).
 *
 * The archive payload is almost entirely JPEG data, which does not compress,
 * so storing avoids pulling in a zip dependency for no size benefit.
 */

/** Blob rejects views backed by a SharedArrayBuffer, so pin the buffer type. */
type Bytes = Uint8Array<ArrayBuffer>;

export interface ZipEntry {
  /** Path inside the archive, e.g. "cards/01-charizard/front.jpg". */
  name: string;
  data: Bytes | string;
  /** Modification time written into the archive (defaults to now). */
  date?: Date;
}

const LOCAL_HEADER_SIG = 0x04034b50;
const CENTRAL_HEADER_SIG = 0x02014b50;
const END_OF_CENTRAL_DIR_SIG = 0x06054b50;
const VERSION_NEEDED = 20;
const FLAG_UTF8 = 0x0800;
const METHOD_STORE = 0;
const MAX_UINT32 = 0xffffffff;

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let bit = 0; bit < 8; bit += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  crcTable = table;
  return table;
}

export function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS time/date pair used by the ZIP headers (2-second resolution). */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function encodeName(name: string): Bytes {
  // Backslashes and leading slashes are not portable inside archives.
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '');
  return new TextEncoder().encode(normalized);
}

function toBytes(data: Bytes | string): Bytes {
  return typeof data === 'string' ? new TextEncoder().encode(data) : data;
}

/**
 * Build a ZIP archive. Throws for archives past the 4 GB ZIP32 limit rather
 * than silently writing an unreadable file (ZIP64 is not implemented).
 */
export function createZip(entries: ZipEntry[]): Blob {
  const parts: BlobPart[] = [];
  const central: Bytes[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encodeName(entry.name);
    const bytes = toBytes(entry.data);
    const { time, date } = dosDateTime(entry.date ?? new Date());
    const crc = crc32(bytes);

    if (bytes.length > MAX_UINT32 || offset > MAX_UINT32) {
      throw new Error('Archive is too large to export (over 4 GB)');
    }

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, LOCAL_HEADER_SIG, true);
    localView.setUint16(4, VERSION_NEEDED, true);
    localView.setUint16(6, FLAG_UTF8, true);
    localView.setUint16(8, METHOD_STORE, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, bytes.length, true);
    localView.setUint32(22, bytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    parts.push(local, bytes);

    const entryHeader = new Uint8Array(46 + nameBytes.length);
    const entryView = new DataView(entryHeader.buffer);
    entryView.setUint32(0, CENTRAL_HEADER_SIG, true);
    entryView.setUint16(4, VERSION_NEEDED, true);
    entryView.setUint16(6, VERSION_NEEDED, true);
    entryView.setUint16(8, FLAG_UTF8, true);
    entryView.setUint16(10, METHOD_STORE, true);
    entryView.setUint16(12, time, true);
    entryView.setUint16(14, date, true);
    entryView.setUint32(16, crc, true);
    entryView.setUint32(20, bytes.length, true);
    entryView.setUint32(24, bytes.length, true);
    entryView.setUint16(28, nameBytes.length, true);
    entryView.setUint16(30, 0, true);
    entryView.setUint16(32, 0, true);
    entryView.setUint16(34, 0, true);
    entryView.setUint16(36, 0, true);
    entryView.setUint32(38, 0, true);
    entryView.setUint32(42, offset, true);
    entryHeader.set(nameBytes, 46);
    central.push(entryHeader);

    offset += local.length + bytes.length;
  }

  const centralSize = central.reduce((sum, header) => sum + header.length, 0);
  if (offset > MAX_UINT32 || centralSize > MAX_UINT32) {
    throw new Error('Archive is too large to export (over 4 GB)');
  }
  if (central.length > 0xffff) {
    throw new Error('Archive has too many files to export (over 65535)');
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, END_OF_CENTRAL_DIR_SIG, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, central.length, true);
  endView.setUint16(10, central.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
