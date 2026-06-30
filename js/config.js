var BACKEND = 'https://script.google.com/macros/s/AKfycbx6V6GZgElw_fSB_VmjdYNbl88mOJeWmrikJZu8Joqte6QxstfLAXM0tkwcIIKqfEOJ6g/exec';
var GOOGLE_CLIENT_ID = '632992894668-gnbb5cclsmfdcnve0g34kmue1c72h73q.apps.googleusercontent.com';

function sha256Hex(str) {
  var data = new TextEncoder().encode(str);
  return crypto.subtle.digest('SHA-256', data).then(function(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function(b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  });
}
