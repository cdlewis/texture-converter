import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { decode } from '../docs/decoder.js';
import { encodePng } from '../docs/png.js';
import { convert, indexFiles } from '../docs/converter.js';
import { unzipSync } from '../docs/vendor/fflate.js';
const metadata = (extra = {}, tile = {}) => ({ width: 2, height: 1, tlut: 'RGBA16', tile: { fmt: 2, siz: 0, line: 1, tmem: 0, palette: 0, ...tile }, ...extra });
const id = '0123456789abcdef.v5';
function entry(path, data) { return { path, file: new Blob([data]) }; }
function pair(prefix = '', meta = metadata(), memory = new Uint8Array(4096)) {
  return [entry(prefix + id + '.tile.json', JSON.stringify(meta)), entry(prefix + id + '.tmem', memory)];
}
function readPng(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks = []; let width, height;
  for (let i = 8; i < bytes.length;) {
    const len = view.getUint32(i), type = new TextDecoder().decode(bytes.subarray(i + 4, i + 8));
    const data = bytes.subarray(i + 8, i + 8 + len);
    // Independent bitwise CRC check of every PNG chunk.
    let crc = 0xffffffff;
    for (const b of bytes.subarray(i + 4, i + 8 + len)) {
      crc ^= b;
      for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    assert.equal((crc ^ 0xffffffff) >>> 0, view.getUint32(i + 8 + len));
    if (type === 'IHDR') { width = view.getUint32(i + 8); height = view.getUint32(i + 12); }
    if (type === 'IDAT') chunks.push(data);
    i += len + 12;
  }
  const rows = inflateSync(Buffer.concat(chunks));
  const pixels = [];
  for (let y = 0; y < height; y++) {
    assert.equal(rows[y * (width * 4 + 1)], 0);
    pixels.push(...rows.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1)));
  }
  return { width, height, pixels };
}
test('CI4 palette bank, nibble ordering, transparent color', () => {
  const m = new Uint8Array(4096); m[0] = 0x12; m.set([0xf8, 1], 0x888); m.set([7, 0xc0], 0x890);
  assert.deepEqual([...decode(metadata({}, { palette: 1 }), m)], [255,0,0,255,0,255,0,0]);
});
test('CI8 odd-row word swap and nonzero TMEM offset', () => {
  const m = new Uint8Array(4096); m[8] = 1; m[20] = 2; m.set([0,0x3f], 0x808); m.set([255,255], 0x810);
  assert.deepEqual([...decode(metadata({width:1,height:2}, {siz:1,tmem:1}), m)], [0,0,255,255,255,255,255,255]);
});
test('I4 intensity is also alpha', () => {
  const m = new Uint8Array(4096); m[0] = 0x8f;
  assert.deepEqual([...decode(metadata({tlut:'None'}, {fmt:4}), m)], [136,136,136,136,255,255,255,255]);
});
test('CI8 wraps at half TMEM', () => {
  const m = new Uint8Array(4096); m.fill(1,2040,2048); m[0]=2; m.set([0xf8,1],0x808); m.set([7,0xc1],0x810);
  assert.deepEqual([...decode(metadata({width:9},{siz:1,tmem:255}),m)], [...Array(8).fill([255,0,0,255]).flat(),0,255,0,255]);
});
test('reject unsupported, truncated, and invalid metadata', () => {
  for (const meta of [metadata({}, {fmt:0}), metadata({width:0}), metadata({height:4097}), metadata({}, {line:0}), metadata({}, {palette:16}), metadata({width:2.5})]) assert.throws(()=>decode(meta,new Uint8Array(4096)));
  assert.throws(()=>decode(metadata(),new Uint8Array(32)), /4096/);
});
test('JavaScript matches Python reference for 96 deterministic synthetic textures', () => {
  let seed = 321;
  const random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed; };
  const cases = [];
  for (let i=0;i<96;i++) {
    const type=i%3;
    const meta=metadata({width:1+random()%96,height:1+random()%40,tlut:type===2?'None':'RGBA16'}, {fmt:type===2?4:2,siz:type===1?1:0,line:1+random()%8,tmem:random()%512,palette:random()%16});
    const memory=Uint8Array.from({length:4096},()=>random()>>>24);
    cases.push({meta,memory:Buffer.from(memory).toString('hex')});
  }
  const python=spawnSync('python3',['tests/reference_decoder.py'],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:8*1024*1024});
  assert.equal(python.status,0,python.stderr);
  JSON.parse(python.stdout).forEach((expected,i)=>assert.equal(Buffer.from(decode(cases[i].meta,Buffer.from(cases[i].memory,'hex'))).toString('hex'),expected,`case ${i}`));
});
test('PNG preserves exact RGBA, including RGB under zero alpha, and valid CRCs', () => {
  const pixels=Uint8Array.from([255,0,0,255,0,255,0,0,20,40,60,128,7,8,9,0]);
  assert.deepEqual(readPng(encodePng(2,2,pixels)),{width:2,height:2,pixels:[...pixels]});
});
test('ZIP preserves nested paths, duplicate basenames, pixels, and PNG-only contents', async () => {
  const progress=[];
  const r=await convert([...pair('one/'),...pair('two/'),entry('notes.txt','ignored')], p=>progress.push(p));
  assert.equal(r.converted,2); assert.equal(r.ignored,1); assert.equal(progress.at(-1).done,2);
  const zip=unzipSync(new Uint8Array(await r.blob.arrayBuffer()));
  assert.deepEqual(Object.keys(zip).sort(),[`images/one/${id}.png`,`images/two/${id}.png`]);
  assert.deepEqual(readPng(zip[`images/one/${id}.png`]).pixels,[0,0,0,0,0,0,0,0]);
  assert.equal('report' in r, false);
});
test('partial success reports unsupported, missing, malformed, version, truncated, and orphan files', async () => {
  const entries=[...pair('good/'),...pair('bad/',metadata({}, {fmt:0})),entry('missing/'+id+'.tile.json','{}'),entry('orphan/'+id+'.tmem',new Uint8Array(4096)),...pair('json/')];
  entries.find(x=>x.path==='json/'+id+'.tile.json').file=new Blob(['{bad']);
  entries.push(...pair('version/').map(e=>({...e,path:e.path.replace('.v5','.v6')})),...pair('short/',metadata(),new Uint8Array(10)));
  const r=await convert(entries);
  assert.equal(r.converted,1); assert.equal(r.failed,5); assert.equal(r.orphans.length,1);
  assert.match(r.errors.map(e=>e.message).join("\n"),/Only RT64 v5/); assert.match(r.errors.map(e=>e.message).join("\n"),/Missing matching/); assert.match(r.errors.map(e=>e.message).join("\n"),/4096/);
});
test('all failures returns errors without a ZIP; empty selection fails clearly', async () => {
  const r=await convert(pair('',metadata({}, {fmt:0})));
  assert.equal(r.blob,null); assert.equal(r.failed,1); assert.match(r.errors.map(e=>e.message).join("\n"),/Unsupported/);
  await assert.rejects(convert([]),/No .tile.json/);
});
test('reject unsafe or duplicate paths; separate runs do not retain previous files', async () => {
  for (const path of ['../bad','/bad','a/../bad','a\\bad']) assert.throws(()=>indexFiles([entry(path,'')]),/Invalid/);
  assert.throws(()=>indexFiles([entry('x',''),entry('x','')]),/Duplicate/);
  await convert(pair('first/'));
  const r=await convert(pair('second/'));
  assert.equal(r.converted,1); assert.ok(r.outputs.every(p=>p.includes('second/')));
});
