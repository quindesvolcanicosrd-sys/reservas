var BACKEND = 'https://script.google.com/macros/s/AKfycbywF3ktrldmN9Nxgaq81HNPnS-EJDg1waoF7sys1aEAE6uL8FMjXDjk_SU-lmW2woUr/exec';
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
