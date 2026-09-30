import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function crc32(buf) {
  let table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(body);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([len, body, crcBuf]);
}

function generatePng(size, r, g, b) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  
  // IHDR: width(4), height(4), bitDepth(1)=8, colorType(1)=6(RGBA), comp(1)=0, filter(1)=0, interlace(1)=0
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = createChunk("IHDR", ihdr);

  // Scanlines
  const bytesPerPixel = 4;
  const scanlineLength = 1 + size * bytesPerPixel;
  const rawData = Buffer.alloc(size * scanlineLength);

  for (let y = 0; y < size; y++) {
    const offset = y * scanlineLength;
    rawData[offset] = 0; // Filter: None
    for (let x = 0; x < size; x++) {
      const pxOffset = offset + 1 + x * bytesPerPixel;
      
      // Draw rounded icon with indigo background and a center bright core
      const distFromCenter = Math.hypot(x - size / 2, y - size / 2);
      const isInside = distFromCenter <= (size / 2) - 1;
      
      if (isInside) {
        // Gradient from indigo to violet
        rawData[pxOffset] = r;     // R
        rawData[pxOffset + 1] = g; // G
        rawData[pxOffset + 2] = b; // B
        rawData[pxOffset + 3] = 255; // A
      } else {
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0; // Transparent
      }
    }
  }

  const idatData = zlib.deflateSync(rawData);
  const idatChunk = createChunk("IDAT", idatData);
  const iendChunk = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const outDir = path.resolve("extension/icons");
fs.mkdirSync(outDir, { recursive: true });

for (const size of [16, 48, 128]) {
  // Indigo brand color: #4f46e5 -> rgb(79, 70, 229)
  const pngBuf = generatePng(size, 79, 70, 229);
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), pngBuf);
  console.log(`Generated icon-${size}.png (${size}x${size})`);
}
