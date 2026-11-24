import { getPublicState } from '../lib/ballot-service.js';
import { sendError, type VercelLikeRequest, type VercelLikeResponse } from '../lib/vercel-http.js';

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    res.setHeader('Cache-Control', 'no-store');
    const data = await getPublicState();
    res.status(200).json(data);
  } catch (err) {
    sendError(res, err);
  }
}
