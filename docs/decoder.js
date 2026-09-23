// Faithful port of the texture branch's catalog.py decoder.
function integer(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
  return value;
}
export function decode(meta, tmem) {
  if (!meta || typeof meta !== 'object' || !meta.tile) throw new Error('Missing tile metadata');
  const tile = meta.tile;
  const { fmt, siz: size } = tile;
  const tlut = meta.tlut;
  if (!((fmt === 2 && (size === 0 || size === 1) && tlut === 'RGBA16') ||
        (fmt === 4 && size === 0 && tlut === 'None'))) throw new Error(`Unsupported format: ${fmt}, ${size}, ${tlut}`);
  if (tmem.length !== 4096) throw new Error(`Expected 4096 TMEM bytes, got ${tmem.length}`);
  const width = integer(meta.width, 'width', 1, 4096);
  const height = integer(meta.height, 'height', 1, 4096);
  const stride = integer(tile.line, 'tile line (must be nonzero)', 1, 511) * 8;
  const start = integer(tile.tmem, 'TMEM offset', 0, 511) * 8;
  const palette = size === 0 && tlut !== 'None' ? integer(tile.palette, 'palette bank', 0, 15) : 0;
  const pixels = new Uint8Array(width * height * 4);
  const mask = tlut !== 'None' ? 0x7ff : 0xfff;
  let out = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const relative = y * stride + ((x << size) >> 1);
      let address;
      if (y & 1) {
        const rowStart = Math.floor(relative / stride) * stride;
        const word = Math.floor((relative - rowStart) / 4) ^ 1;
        address = start + rowStart + word * 4 + (relative & 3);
      } else address = start + relative;
      let value = tmem[address & mask];
      if (size === 0) value = (value >> (x & 1 ? 0 : 4)) & 15;
      if (tlut === 'None') {
        pixels.fill(value * 17, out, out + 4);
        out += 4;
      } else {
        const pa = 0x800 + value * 8 + (size === 0 ? palette * 128 : 0);
        const color = (tmem[pa & 0xfff] << 8) | tmem[(pa + 1) & 0xfff];
        for (const shift of [11, 6, 1]) {
          const v = (color >> shift) & 31;
          pixels[out++] = (v << 3) | (v >> 2);
        }
        pixels[out++] = color & 1 ? 255 : 0;
      }
    }
  }
  return pixels;
}
