const $ = id => document.getElementById(id);
let worker = null;
let urls = [];
let state = { status: 'ready' };
function release() {
  for (const url of urls) URL.revokeObjectURL(url);
  urls = [];
}
function link(id, blob, filename) {
  const url = URL.createObjectURL(blob);
  urls.push(url);
  $(id).href = url;
  $(id).download = filename;
  $(id).hidden = false;
}
function stop() {
  worker?.terminate(); worker = null;
  $('select').disabled = false; $('cancel').hidden = true;
}
function error(message) {
  stop(); state = { status: 'error', message };
  $('status').textContent = message;
  $('status').classList.add('error');
  $('progress').hidden = true;
}
function cancel() {
  if (!worker) return false;
  stop(); state = { status: 'cancelled' };
  $('status').textContent = 'Conversion cancelled. Your original files are unchanged.';
  $('progress').hidden = true;
  return true;
}
$('select').addEventListener('click', () => $('folder').click());
$('cancel').addEventListener('click', cancel);
$('folder').addEventListener('change', () => {
  const files = Array.from($('folder').files);
  $('folder').value = '';
  if (!files.length) return;
  stop(); release();
  for (const id of ['download', 'download-note', 'issues']) $(id).hidden = true;
  $('issue-list').replaceChildren(); $('counts').textContent = '';
  $('result').hidden = false; $('progress').hidden = false; $('progress').value = 0;
  $('status').classList.remove('error'); $('status').textContent = 'Reading your dump folder…';
  $('select').disabled = true; $('cancel').hidden = false;
  state = { status: 'converting', converted: 0, failed: 0 };
  const root = files[0].webkitRelativePath.split('/')[0];
  const name = (root || 'textures').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 100);
  const entries = files.map(file => ({ path: file.webkitRelativePath.split('/').slice(1).join('/'), file }));
  try { worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); }
  catch { error('This browser could not start the converter. Try a current desktop browser.'); return; }
  worker.onerror = () => error('The converter stopped unexpectedly. Try a smaller folder or reload this page.');
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      state = { status: 'converting', ...data };
      $('progress').max = data.total; $('progress').value = data.done;
      $('status').textContent = `Converting ${data.done.toLocaleString()} of ${data.total.toLocaleString()} textures`;
      $('counts').textContent = `${data.converted.toLocaleString()} converted · ${data.failed.toLocaleString()} failed`;
    } else if (data.type === 'error') error(data.message);
    else if (data.type === 'complete') {
      stop();
      const r = data.result;
      state = { status: 'complete', converted: r.converted, failed: r.failed, unpaired: r.orphans.length, downloadable: !!r.blob };
      $('status').textContent = r.converted ? `${r.converted.toLocaleString()} PNG${r.converted === 1 ? '' : 's'} ready` : 'No textures could be converted.';
      $('counts').textContent = `${r.converted.toLocaleString()} converted · ${r.failed.toLocaleString()} failed · ${r.orphans.length.toLocaleString()} unpaired files`;
      $('progress').max = 1; $('progress').value = 1;
      const issues = [...r.errors, ...r.orphans.map(path => ({ path, message: 'Missing matching .tile.json' }))];
      if (issues.length) {
        $('issues').hidden = false;
        $('issues-title').textContent = `${issues.length.toLocaleString()} file${issues.length === 1 ? '' : 's'} needing attention`;
        for (const issue of issues) {
          const li = document.createElement('li'); li.textContent = `${issue.path}: ${issue.message}`; $('issue-list').append(li);
        }
      }
      if (r.blob) {
        link('download', r.blob, name + '-pngs.zip');
        $('download').click(); $('download-note').hidden = false;
      }
    }
  };
  worker.postMessage({ entries });
});
if (!('webkitdirectory' in $('folder')) || !('Worker' in window)) {
  $('select').disabled = true; $('result').hidden = false;
  $('status').textContent = 'Folder conversion needs a current desktop browser, such as Chrome, Edge, Firefox, or Safari.';
  $('progress').hidden = true;
}
const lifecycle = new AbortController();
const context = document.modelContext;
if (context?.registerTool) {
  for (const tool of [
    { name: 'get_conversion_status', description: 'Read the current local texture conversion status. Does not select or upload files.', annotations: { readOnlyHint: true }, execute: () => ({ ...state }) },
    { name: 'cancel_conversion', description: 'Cancel the active texture conversion, as with the visible Cancel button.', annotations: { readOnlyHint: false }, execute: () => ({ cancelled: cancel(), ...state }) }
  ]) {
    const execute = tool.execute;
    tool.inputSchema = { type: 'object', properties: {}, additionalProperties: false };
    tool.execute = input => { if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Expected an empty object'); return execute(); };
    try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Optional browser capability. */ }
  }
}
window.addEventListener('pagehide', () => { stop(); release(); lifecycle.abort(); });
