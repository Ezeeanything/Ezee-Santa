import { lookupMyMatch } from '../lib/ballot-service.js';
import {
  parseJsonBody,
  sendError,
  type VercelLikeRequest,
  type VercelLikeResponse,
} from '../lib/vercel-http.js';

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const body = parseJsonBody(req);
    const data = await lookupMyMatch(body);
    res.status(200).json(data);
  } catch (err) {
    sendError(res, err);
  }
}
