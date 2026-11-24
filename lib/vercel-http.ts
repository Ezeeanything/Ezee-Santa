import { ServiceError } from './ballot-service.js';

export interface VercelLikeRequest {
  method?: string;
  body?: unknown;
}

export interface VercelLikeResponse {
  status(code: number): VercelLikeResponse;
  json(payload: unknown): void;
  setHeader(name: string, value: string): void;
}

export function parseJsonBody(req: VercelLikeRequest): Record<string, unknown> {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof req.body === 'object') {
    return req.body as Record<string, unknown>;
  }
  return {};
}

export function sendError(res: VercelLikeResponse, err: unknown): void {
  if (err instanceof ServiceError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error('API error:', err);
  res.status(500).json({ error: 'Internal server error.' });
}
