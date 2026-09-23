# Reference: snowboardkids-recomp texture branch, texture-pack/catalog.py
def decode(meta, tmem):
    tile = meta['tile']
    fmt, size, tlut = tile['fmt'], tile['siz'], meta['tlut']
    if (fmt, size, tlut) not in ((2, 0, 'RGBA16'), (2, 1, 'RGBA16'), (4, 0, 'None')):
        raise ValueError(f'Unsupported format: {fmt}, {size}, {tlut}')
    if len(tmem) != 4096:
        raise ValueError(f'Expected 4096 TMEM bytes, got {len(tmem)}')
    width, height = meta['width'], meta['height']
    if not (0 < width <= 4096 and 0 < height <= 4096):
        raise ValueError('Invalid dimensions')
    stride, start = tile['line'] * 8, tile['tmem'] * 8
    if stride <= 0:
        raise ValueError('Zero stride requires separate verification')
    pixels = bytearray()
    mask = 0x7FF if tlut != 'None' else 0xFFF
    for y in range(height):
        for x in range(width):
            relative = y * stride + ((x << size) >> 1)
            if y & 1:
                row_start = (relative // stride) * stride
                word = ((relative - row_start) // 4) ^ 1
                address = start + row_start + word * 4 + (relative & 3)
            else:
                address = start + relative
            value = tmem[address & mask]
            if size == 0:
                value = (value >> (0 if x & 1 else 4)) & 15
            if tlut == 'None':
                pixels.extend([value * 17] * 4)
            else:
                palette_address = 0x800 + value * 8
                if size == 0:
                    palette_address += tile['palette'] * 128
                color = (tmem[palette_address & 0xFFF] << 8) | tmem[(palette_address + 1) & 0xFFF]
                rgb = [(color >> shift) & 31 for shift in (11, 6, 1)]
                pixels.extend([(v << 3) | (v >> 2) for v in rgb] + [255 if color & 1 else 0])
    return bytes(pixels)


if __name__ == "__main__":
    import sys, json
    cases = json.load(sys.stdin)
    json.dump([decode(c["meta"], bytes.fromhex(c["memory"])).hex() for c in cases], sys.stdout)
