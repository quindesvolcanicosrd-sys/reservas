var BACKEND = 'https://script.google.com/macros/s/AKfycbxMt_DyIDdjGyl6JDPOx4vXwkXAsacE2P04gXagAJZ7L_nWrd3yQMD7jy2v6cP_2RK22w/exec';
var GOOGLE_CLIENT_ID = '632992894668-gnbb5cclsmfdcnve0g34kmue1c72h73q.apps.googleusercontent.com';

function sha256Hex(str) {
  var data = new TextEncoder().encode(str);
  return crypto.subtle.digest('SHA-256', data).then(function(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function(b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  });
}
