// Zero-dependency image dimension and format reader (PNG, JPEG + EXIF, GIF, WebP, AVIF/HEIF, SVG, ICO).

function readPng(buf) {
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height, type: 'png' } : null;
}

function readGif(buf) {
  if (buf.length < 10) return null;
  const header = buf.subarray(0, 6).toString('ascii');
  if (header !== 'GIF87a' && header !== 'GIF89a') return null;
  const width = buf.readUInt16LE(6);
  const height = buf.readUInt16LE(8);
  return width > 0 && height > 0 ? { width, height, type: 'gif' } : null;
}

function readExifOrientation(buf, offset, length) {
  if (offset + 14 > buf.length || buf.subarray(offset, offset + 6).toString('ascii') !== 'Exif\0\0') return undefined;
  const tiff = offset + 6;
  const end = Math.min(buf.length, offset + length);
  if (tiff + 8 > end) return undefined;
  const endian = buf.subarray(tiff, tiff + 2).toString('ascii');
  const le = endian === 'II';
  if (!le && endian !== 'MM') return undefined;
  const u16 = (pos) => le ? buf.readUInt16LE(pos) : buf.readUInt16BE(pos);
  const u32 = (pos) => le ? buf.readUInt32LE(pos) : buf.readUInt32BE(pos);
  if (u16(tiff + 2) !== 42) return undefined;
  const ifd0 = tiff + u32(tiff + 4);
  if (ifd0 + 2 > end) return undefined;
  const count = u16(ifd0);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > end) break;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      if (value >= 1 && value <= 8) return value;
    }
  }
  return undefined;
}

function readJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  let orientation;
  while (offset + 4 <= buf.length) {
    while (offset < buf.length && buf[offset] !== 0xff) offset += 1;
    while (offset < buf.length && buf[offset] === 0xff) offset += 1;
    if (offset >= buf.length) break;
    const marker = buf[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > buf.length) break;
    const length = buf.readUInt16BE(offset);
    if (length < 2 || offset + length > buf.length) break;
    if (marker === 0xe1 && orientation === undefined) {
      orientation = readExifOrientation(buf, offset + 2, length - 2);
    }
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      if (offset + 7 <= buf.length) {
        const height = buf.readUInt16BE(offset + 3);
        const width = buf.readUInt16BE(offset + 5);
        if (width > 0 && height > 0) return { width, height, type: 'jpg', ...(orientation ? { orientation } : {}) };
      }
    }
    offset += length;
  }
  return null;
}

function readWebp(buf) {
  if (buf.length < 30) return null;
  if (buf.subarray(0, 4).toString('ascii') !== 'RIFF' || buf.subarray(8, 12).toString('ascii') !== 'WEBP') return null;
  const chunk = buf.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8X') {
    const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return { width, height, type: 'webp' };
  }
  if (chunk === 'VP8 ') {
    if (buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
      const width = buf.readUInt16LE(26) & 0x3fff;
      const height = buf.readUInt16LE(28) & 0x3fff;
      return width > 0 && height > 0 ? { width, height, type: 'webp' } : null;
    }
  }
  if (chunk === 'VP8L' && buf[20] === 0x2f) {
    const bits = buf.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height, type: 'webp' };
  }
  return null;
}

function readAvif(buf) {
  if (buf.length < 16 || buf.subarray(4, 8).toString('ascii') !== 'ftyp') return null;
  const major = buf.subarray(8, 12).toString('ascii');
  const ftypSize = buf.readUInt32BE(0);
  const brands = buf.subarray(8, Math.min(buf.length, ftypSize)).toString('ascii');
  if (!['avif', 'avis', 'mif1', 'heic', 'heix'].includes(major) && !brands.includes('avif')) return null;
  // Locate the ISOBMFF 'ispe' (Image Spatial Extents) property box
  const needle = Buffer.from('ispe');
  let searchFrom = ftypSize;
  while (searchFrom < buf.length - 16) {
    const idx = buf.indexOf(needle, searchFrom);
    if (idx < 4 || idx + 16 > buf.length) break;
    const boxSize = buf.readUInt32BE(idx - 4);
    if (boxSize === 20) {
      const width = buf.readUInt32BE(idx + 8);
      const height = buf.readUInt32BE(idx + 12);
      if (width > 0 && height > 0) return { width, height, type: 'avif' };
    }
    searchFrom = idx + 4;
  }
  return null;
}

function readIco(buf) {
  if (buf.length < 22) return null;
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null;
  const count = buf.readUInt16LE(4);
  if (count < 1 || buf.length < 6 + count * 16) return null;
  let width = buf[6] || 256;
  let height = buf[7] || 256;
  return { width, height, type: 'ico' };
}

function parseSvgLength(value) {
  if (!value) return 0;
  const match = String(value).trim().match(/^([0-9]+(?:\.[0-9]+)?)(px|pt|pc|in|cm|mm)?$/i);
  if (!match) return 0;
  const num = Number(match[1]);
  const unit = (match[2] || 'px').toLowerCase();
  const scale = { px: 1, pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 }[unit] || 1;
  return Math.round(num * scale);
}

function readSvg(buf) {
  const head = buf.subarray(0, Math.min(buf.length, 4096)).toString('utf8');
  const match = head.match(/<svg\b([^>]*)>/i);
  if (!match) return null;
  const attrs = match[1];
  const widthAttr = attrs.match(/\bwidth\s*=\s*["']([^"']+)["']/i)?.[1];
  const heightAttr = attrs.match(/\bheight\s*=\s*["']([^"']+)["']/i)?.[1];
  let width = parseSvgLength(widthAttr);
  let height = parseSvgLength(heightAttr);
  const viewBox = attrs.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1];
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      const vbW = parts[2], vbH = parts[3];
      if (!width && !height) { width = Math.round(vbW); height = Math.round(vbH); }
      else if (!width) width = Math.round(height * (vbW / vbH));
      else if (!height) height = Math.round(width * (vbH / vbW));
    }
  }
  return width > 0 && height > 0 ? { width, height, type: 'svg' } : null;
}

export function imageSize(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const result = readPng(buf) || readJpeg(buf) || readGif(buf) || readWebp(buf) || readAvif(buf) || readIco(buf) || readSvg(buf);
  if (!result) throw new Error('Unsupported or invalid image data');
  return result;
}
