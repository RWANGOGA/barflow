/**
 * Minimal ZIP writer for exports: store method only (no compression), UTF-8
 * names, no external dependency. Spreadsheets open these archives directly.
 */
export type ZipFile = { name: string; data: string | Uint8Array }

const encoder = new TextEncoder()

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** DOS timestamps only carry two-second resolution and a 1980 epoch. */
function dosStamp(value: Date) {
  const year = Math.max(value.getFullYear(), 1980)
  return {
    time: (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
  }
}

export function createZip(files: ZipFile[]): Uint8Array<ArrayBuffer> {
  if (files.length > 65535) throw new Error('Too many files for a ZIP archive')

  const stamp = dosStamp(new Date())
  const entries = files.map((file) => {
    const name = encoder.encode(file.name)
    const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data
    return { name, data, crc: crc32(data), offset: 0 }
  })

  const localSize = entries.reduce((total, entry) => total + 30 + entry.name.length + entry.data.length, 0)
  const centralSize = entries.reduce((total, entry) => total + 46 + entry.name.length, 0)
  const buffer = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(buffer.buffer)
  let offset = 0

  const u16 = (value: number) => {
    view.setUint16(offset, value, true)
    offset += 2
  }
  const u32 = (value: number) => {
    view.setUint32(offset, value, true)
    offset += 4
  }

  for (const entry of entries) {
    entry.offset = offset
    u32(0x04034b50) // local file header
    u16(20) // version needed
    u16(0x0800) // UTF-8 file names
    u16(0) // stored, no compression
    u16(stamp.time)
    u16(stamp.date)
    u32(entry.crc)
    u32(entry.data.length)
    u32(entry.data.length)
    u16(entry.name.length)
    u16(0) // extra field length
    buffer.set(entry.name, offset)
    offset += entry.name.length
    buffer.set(entry.data, offset)
    offset += entry.data.length
  }

  const centralStart = offset
  for (const entry of entries) {
    u32(0x02014b50) // central directory header
    u16(20) // version made by
    u16(20) // version needed
    u16(0x0800)
    u16(0)
    u16(stamp.time)
    u16(stamp.date)
    u32(entry.crc)
    u32(entry.data.length)
    u32(entry.data.length)
    u16(entry.name.length)
    u16(0) // extra
    u16(0) // comment
    u16(0) // disk number
    u16(0) // internal attributes
    u32(0) // external attributes
    u32(entry.offset)
    buffer.set(entry.name, offset)
    offset += entry.name.length
  }
  const centralEnd = offset

  u32(0x06054b50) // end of central directory
  u16(0)
  u16(0)
  u16(entries.length)
  u16(entries.length)
  u32(centralEnd - centralStart)
  u32(centralStart)
  u16(0) // archive comment length

  return buffer
}
