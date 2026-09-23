import { convert } from './converter.js';
self.onmessage = async ({ data }) => {
  try {
    const result = await convert(data.entries, progress => self.postMessage({ type: 'progress', ...progress }));
    self.postMessage({ type: 'complete', result });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || 'Conversion failed. Try a smaller folder.' });
  }
};
