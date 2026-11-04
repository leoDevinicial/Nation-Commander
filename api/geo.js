// País do visitante para escolher o idioma na primeira visita (04/11). A Vercel já informa o país pelo IP no
// cabeçalho x-vercel-ip-country: nada sai para serviços de terceiros e o IP não é guardado nem devolvido.
export default function handler(req, res) {
  const raw = req.headers['x-vercel-ip-country'];
  const country = typeof raw === 'string' && /^[A-Z]{2}$/i.test(raw) ? raw.toUpperCase() : null;
  res.setHeader('cache-control', 'private, no-store');
  res.setHeader('content-type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify({ country }));
}
