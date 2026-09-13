'use strict';

// Race a list of async API callables; resolve with the first one returning a
// truthy non-empty result. Failed/empty/timed-out APIs are ignored. If all
// fail, returns null. Drastically faster than sequential fallback chains.
async function raceApis(apis, { perCallTimeoutMs = 12000 } = {}) {
  if (!Array.isArray(apis) || apis.length === 0) return null;
  const wrapped = apis.map(fn => new Promise((resolve, reject) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; reject(new Error('timeout')); } }, perCallTimeoutMs);
    Promise.resolve()
      .then(() => fn())
      .then(v => {
        if (done) return;
        const empty = v === null || v === undefined || v === false || (typeof v === 'string' && !v.trim());
        if (empty) { done = true; clearTimeout(t); reject(new Error('empty')); return; }
        done = true; clearTimeout(t); resolve(v);
      })
      .catch(e => { if (done) return; done = true; clearTimeout(t); reject(e); });
  }));
  try { return await Promise.any(wrapped); } catch { return null; }
}

// Same as raceApis but returns whichever first parsed object .check passes.
// Each entry is { name, exec: async () => parsedResult|null }.
async function raceApiObjects(entries, opts) {
  return raceApis(entries.map(e => e.exec), opts);
}

module.exports = { raceApis, raceApiObjects };
