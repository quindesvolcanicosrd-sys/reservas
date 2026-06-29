var BACKEND = 'https://script.google.com/macros/s/AKfycbzOxG08yj9J1roC_pDkK4jYnzRUL-pBquH0uco7ogceRBLT7w5hgTuU7_Y0FBoWqDzkOQ/exec';
var GOOGLE_CLIENT_ID = '632992894668-gnbb5cclsmfdcnve0g34kmue1c72h73q.apps.googleusercontent.com';

function sha256Hex(str) {
  var data = new TextEncoder().encode(str);
  return crypto.subtle.digest('SHA-256', data).then(function(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function(b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  });
}
