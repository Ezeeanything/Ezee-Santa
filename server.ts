import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express, { type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import {
  executeSpin,
  getPublicState,
  getSpinOptions,
  lookupMyMatch,
  ServiceError,
  signupParticipant,
} from './lib/ballot-service.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

function handleExpressError(res: Response, err: unknown): void {
  if (err instanceof ServiceError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error.' });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.get('/api/state', async (_req: Request, res: Response) => {
    try {
      const data = await getPublicState();
      res.json(data);
    } catch (err) {
      handleExpressError(res, err);
    }
  });

  app.post('/api/signup', async (req: Request, res: Response) => {
    try {
      const data = await signupParticipant(req.body ?? {});
      res.json(data);
    } catch (err) {
      handleExpressError(res, err);
    }
  });

  app.post('/api/spin-options', async (req: Request, res: Response) => {
    try {
      const data = await getSpinOptions(req.body ?? {});
      res.json(data);
    } catch (err) {
      handleExpressError(res, err);
    }
  });

  app.post('/api/spin', async (req: Request, res: Response) => {
    try {
      const data = await executeSpin(req.body ?? {});
      res.json(data);
    } catch (err) {
      handleExpressError(res, err);
    }
  });

  app.post('/api/my-match', async (req: Request, res: Response) => {
    try {
      const data = await lookupMyMatch(req.body ?? {});
      res.json(data);
    } catch (err) {
      handleExpressError(res, err);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ezee Santa server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
