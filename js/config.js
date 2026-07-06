var BACKEND = 'https://script.google.com/macros/s/AKfycbzJM3L3PLYwQcp_DTNjYH2ckF8cgM5t4LQjmMnxP9pGHozE1bpo-A6z-EouveK_K5uKpw/exec';
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
