import { test } from 'node:test';
import assert from 'node:assert/strict';
class Element {
  constructor() { this.listeners={}; this.hidden=false; this.value=''; this.children=[]; this.classList={add(){},remove(){}}; }
  addEventListener(name, fn) { this.listeners[name]=fn; }
  click() { this.clicks=(this.clicks||0)+1; this.listeners.click?.(); }
  replaceChildren() { this.children=[]; }
  append(child) { this.children.push(child); }
}
test('UI cancellation, completion download, retry cleanup, and optional tool contract', async () => {
  const elements=new Map();
  const element=id=>{ if(!elements.has(id))elements.set(id,new Element()); return elements.get(id); };
  element('folder').webkitdirectory=true;
  const registered=new Map();
  globalThis.document={getElementById:element,createElement:()=>new Element(),modelContext:{registerTool(tool){registered.set(tool.name,tool);}}};
  globalThis.window={Worker:true,addEventListener(){}};
  const workers=[];
  globalThis.Worker=class { constructor(){workers.push(this);} postMessage(data){this.data=data;} terminate(){this.terminated=true;} };
  await import('../docs/app.js');
  const status=registered.get('get_conversion_status');
  const cancel=registered.get('cancel_conversion');
  assert.equal(status.execute({}).status,'ready');
  assert.throws(()=>cancel.execute({unexpected:true}),/empty object/);
  assert.equal(cancel.execute({}).cancelled,false);
  function select(){element('folder').files=[{webkitRelativePath:'Dumps/a.tile.json'}];element('folder').listeners.change();}
  select(); assert.equal(element('select').disabled,true);
  assert.equal(workers[0].data.entries[0].path,'a.tile.json');
  assert.equal(cancel.execute({}).cancelled,true);
  assert.equal(workers[0].terminated,true);
  assert.equal(element('select').disabled,false);
  select();
  workers[1].onmessage({data:{type:'complete',result:{converted:1,failed:0,orphans:[],errors:[],blob:new Blob(['zip'])}}});
  assert.equal(element('download').clicks,1);
  assert.equal(element('download').download,'Dumps-pngs.zip');
  assert.equal(status.execute({}).downloadable,true);
  select();
  assert.equal(element('download').hidden,true);
  workers[2].onmessage({data:{type:'error',message:'Invalid input'}});
  assert.equal(element('status').textContent,'Invalid input');
  assert.equal(element('select').disabled,false);
  assert.equal(status.execute({}).status,'error');
});
