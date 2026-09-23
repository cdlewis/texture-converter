import { decode } from './decoder.js';
import { encodePng } from './png.js';
import { Zip, ZipPassThrough } from './vendor/fflate.js';
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
export function indexFiles(entries) {
  const files = new Map();
  for (const entry of entries) {
    const path = entry.path;
    if (typeof path !== 'string' || path.startsWith('/') || path.includes('\\') || path.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Invalid relative file path');
    if (files.has(path)) throw new Error(`Duplicate input path: ${path}`);
    files.set(path, entry.file);
  }
  const tiles = [...files.keys()].filter(p => p.endsWith('.tile.json')).sort();
  const orphans = [...files.keys()].filter(p => p.endsWith('.tmem') && !files.has(p.slice(0, -5) + '.tile.json')).sort();
  return { files, tiles, orphans };
}
export async function convert(entries, onProgress = () => {}) {
  const { files, tiles, orphans } = indexFiles(entries);
  if (!tiles.length) throw new Error('No .tile.json files found. Choose an RT64 dump folder containing .tile.json and .tmem pairs.');
  const result = { converted: 0, failed: 0, orphans, errors: [], outputs: [], ignored: [...files.keys()].filter(p => !p.endsWith('.tile.json') && !p.endsWith('.tmem')).length };
  const chunks = [];
  let bytes = 0;
  const zip = new Zip((error, data) => {
    if (error) throw error;
    bytes += data.length;
    if (bytes > MAX_ARCHIVE_BYTES) throw new Error('The download exceeds 512 MB. Convert smaller subfolders separately.');
    chunks.push(data);
  });
  function add(path, data) {
    const stream = new ZipPassThrough(path);
    zip.add(stream);
    stream.push(data, true);
  }
  for (const path of tiles) {
    let png, output;
    try {
      const stem = path.slice(0, -10);
      if (!/^[0-9a-f]{16}\.v5$/.test(stem.split('/').at(-1))) throw new Error('Only RT64 v5 dump names are supported');
      const memory = files.get(stem + '.tmem');
      if (!memory) throw new Error('Missing matching .tmem file');
      if (memory.size !== 4096) throw new Error(`Expected 4096 TMEM bytes, got ${memory.size}`);
      const metadataFile = files.get(path);
      if (metadataFile.size > 1024 * 1024) throw new Error('Tile metadata is unexpectedly large (over 1 MB)');
      const metadata = JSON.parse(await metadataFile.text());
      const pixels = decode(metadata, new Uint8Array(await memory.arrayBuffer()));
      png = encodePng(metadata.width, metadata.height, pixels);
      output = 'images/' + stem + '.png';
    } catch (error) {
      result.failed++;
      result.errors.push({ path, message: error.message });
    }
    // Archive errors stop the batch rather than reporting a damaged ZIP as successful.
    if (png) { add(output, png); result.outputs.push(output); result.converted++; }
    onProgress({ done: result.converted + result.failed, total: tiles.length, converted: result.converted, failed: result.failed });
  }
  zip.end();
  return { ...result, blob: result.converted ? new Blob(chunks, { type: 'application/zip' }) : null };
}
