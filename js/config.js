var BACKEND = 'https://script.google.com/macros/s/AKfycbxpqsTiZ_bxAIZ0J6hThPVbut6bwCWwt1P2yhp52Tup-3R4_qZTgVUjuz_2xlykeluk/exec';
var GOOGLE_CLIENT_ID = '632992894668-gnbb5cclsmfdcnve0g34kmue1c72h73q.apps.googleusercontent.com';
var MAPS_API_KEY = 'AIzaSyDSGkh2AyuM_-6ngo5-XMPi0NYrXZHEBl8';

function sha256Hex(str) {
  var data = new TextEncoder().encode(str);
  return crypto.subtle.digest('SHA-256', data).then(function(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function(b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  });
}
