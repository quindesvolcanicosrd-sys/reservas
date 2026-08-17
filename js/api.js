var _token = '';

function api(params, onSuccess, onError) {
  if (_token && !params.token) params.token = _token;
  var url = BACKEND + '?' + Object.keys(params).map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
  fetch(url, { method: 'GET', mode: 'cors', headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY } })
    .then(function(r) { return r.json(); })
    .then(function(data) { if (data && data.error) { onError({ message: data.error }); } else { onSuccess(data); } })
    .catch(function(e) { onError(e); });
}

function apiPost(params, onSuccess, onError) {
  var body = Object.keys(params).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  fetch(BACKEND, {
    method: 'POST', mode: 'cors',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
    body: body
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data && data.error) { onError({ message: data.error }); } else { onSuccess(data); }
  })
  .catch(function(e) { onError(e); });
}
