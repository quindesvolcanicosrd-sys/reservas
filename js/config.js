var BACKEND = 'https://script.google.com/macros/s/AKfycbxu0oihRmPdOb9Yud_FdJJwH7_l1AhMk15E4y_KmGkKUMEuGl11pTOTaMQ6mV3tBdgo/exec';
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
