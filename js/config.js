var BACKEND = 'https://script.google.com/macros/s/AKfycbxucgTE1Vk9Z4zKMtzo--5u5l3rvbq5UOX_06xU8AU5y1KF52N5N0i861qUJ954_Io7-g/exec';
var GOOGLE_CLIENT_ID = '632992894668-gnbb5cclsmfdcnve0g34kmue1c72h73q.apps.googleusercontent.com';

function sha256Hex(str) {
  var data = new TextEncoder().encode(str);
  return crypto.subtle.digest('SHA-256', data).then(function(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function(b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  });
}
