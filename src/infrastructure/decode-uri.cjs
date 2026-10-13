// CommonJS bridge for query-string 7. The fixed upstream decoder is pinned in package-lock.
const decode = require('safe-uri-decoder').default;
// The 0.2.x API accepted form-style plus signs; preserve that behavior before decoding.
module.exports = (input) => decode(typeof input === 'string' ? input.replace(/\+/g, ' ') : input);
