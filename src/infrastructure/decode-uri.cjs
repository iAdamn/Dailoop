// CommonJS bridge for query-string 7. Upstream decoder is pinned in package-lock;
// postinstall additionally replaces its map fallback with a single-pass decode.
const decode = require('safe-uri-decoder').default;
// The 0.2.x API accepted form-style plus signs; preserve that behavior before decoding.
module.exports = (input) => decode(typeof input === 'string' ? input.replace(/\+/g, ' ') : input);
