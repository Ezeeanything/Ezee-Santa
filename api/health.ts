import type { VercelLikeRequest, VercelLikeResponse } from '../lib/vercel-http.js';

export default function handler(req: VercelLikeRequest, res: VercelLikeResponse): void {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.status(200).json({ ok: true });
}
