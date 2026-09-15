const PAYSTACK_API = 'https://api.paystack.co';

function json(res, code, body) {
  res.status(code).json(body);
}

function originOf(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return proto + '://' + host;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const secret = process.env.PAYSTACK_API_SECRET;
  if (!secret) return json(res, 500, { ok: false, error: 'Paystack is not configured on this site yet.' });

  try {
    if (req.method === 'POST') {
      const b = req.body || {};
      const email = String(b.email || '').trim();
      const amount = Math.round(Number(b.amount));
      const reference = String(b.reference || '').trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return json(res, 400, { ok: false, error: 'A valid email address is required.' });
      if (!amount || amount <= 0) return json(res, 400, { ok: false, error: 'An amount is required.' });

      const payload = {
        email,
        amount: Math.round(amount * 100),
        currency: 'ZAR',
        reference,
        callback_url: originOf(req) + '/pay-confirm.html',
        metadata: {
          customer_name: String(b.name || ''),
          customer_company: String(b.company || '')
        }
      };

      const r = await fetch(PAYSTACK_API + '/transaction/initialize', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!data.status) return json(res, 400, { ok: false, error: data.message || 'Payment setup failed.' });
      return json(res, 200, {
        ok: true,
        authorization_url: data.data.authorization_url,
        access_code: data.data.access_code || '',
        reference: data.data.reference || reference
      });
    }

    if (req.method === 'GET') {
      const reference = String(req.query.reference || '').trim();
      if (!reference) return json(res, 400, { ok: false, error: 'A payment reference is required.' });

      const r = await fetch(PAYSTACK_API + '/transaction/verify/' + encodeURIComponent(reference), {
        headers: { Authorization: 'Bearer ' + secret }
      });
      const data = await r.json();
      if (!data.status) return json(res, 400, { ok: false, error: data.message || 'Verification failed.' });

      const d = data.data;
      return json(res, 200, {
        ok: true,
        status: d.status,
        amount: (d.amount || 0) / 100,
        currency: d.currency || 'ZAR',
        paid_at: d.paid_at || null,
        channel: d.channel || '',
        reference: d.reference || reference,
        transaction_id: d.id || '',
        email: (d.customer || {}).email || ''
      });
    }

    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  } catch (e) {
    return json(res, 500, { ok: false, error: 'Server error.' });
  }
};