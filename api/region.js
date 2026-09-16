function json(res, code, body) {
  res.status(code).json(body);
}

function classify(country) {
  const cc = (country || '').toUpperCase();
  if (cc === 'ZA') return 'ZA';
  if (cc === 'US' || cc === 'GB' || cc === 'UK') return 'USD';
  return '';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return json(res, 405, { region: '', error: 'Method not allowed.' });

  const country = req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || '';
  const region = classify(country);
  return json(res, 200, { region, country: (country || '').toLowerCase() });
};