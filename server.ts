import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express, { type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'ballot-store.json');

const STAFF_NAMES = [
  'Odafe',
  'Ayoola',
  'Kemi',
  'Funmi',
  'Merit',
  'Grace',
  'Rikky',
  'Mary',
  'Folorunsho',
  'Olamide',
  'Sandra',
  'Victoria',
  'Olawale',
  'Steven',
  'Precious',
  'Balogun',
  'Tunde',
  'Deji',
  'Rahmon',
  'Ovie',
  'Peter',
  'Boluwatife',
  'Muftau',
  'Shalom',
] as const;

interface StoredEvent {
  id: string;
  epoch: string;
  title: string;
  exchangeDate: string;
  venue: string;
}

interface StoredParticipant {
  id: string;
  firstName: string;
  giftHint: string;
  pinHash: string | null;
  hasSpun: boolean;
  isMatched: boolean;
  claimedAt: string | null;
}

interface StoredAssignment {
  giverId: string;
  recipientId: string;
  matchedAt: string;
}

interface BallotStore {
  rosterVersion: number;
  event: StoredEvent;
  participants: StoredParticipant[];
  assignments: Record<string, StoredAssignment>;
}

const CURRENT_ROSTER_VERSION = 3;

function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(secret, salt, 32).toString('hex');
  return `${salt}:${derived}`;
}

function verifySecret(secret: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuffer = Buffer.from(keyHex, 'hex');
  const derivedBuffer = crypto.scryptSync(secret, salt, 32);
  if (keyBuffer.length !== derivedBuffer.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedBuffer);
}

function createDefaultStore(): BallotStore {
  return {
    rosterVersion: CURRENT_ROSTER_VERSION,
    event: {
      id: 'office-eoy-2026',
      epoch: crypto.randomUUID(),
      title: 'Ezee Santa Gift Exchange',
      exchangeDate: '2026-12-18',
      venue: 'End-of-Year Office Party',
    },
    participants: STAFF_NAMES.map((firstName) => ({
      id: firstName.toLowerCase(),
      firstName,
      giftHint: '',
      pinHash: null,
      hasSpun: false,
      isMatched: false,
      claimedAt: null,
    })),
    assignments: {},
  };
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadStore(): BallotStore {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) {
    const initial = createDefaultStore();
    saveStore(initial);
    return initial;
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as BallotStore;
    if (
      parsed.rosterVersion !== CURRENT_ROSTER_VERSION ||
      !parsed.event ||
      !Array.isArray(parsed.participants) ||
      !parsed.assignments
    ) {
      const fresh = createDefaultStore();
      saveStore(fresh);
      return fresh;
    }
    if (parsed.event.title === 'End-of-Year Office Gift Exchange') {
      parsed.event.title = 'Ezee Santa Gift Exchange';
      saveStore(parsed);
    }
    return parsed;
  } catch {
    const fallback = createDefaultStore();
    saveStore(fallback);
    return fallback;
  }
}

function saveStore(store: BallotStore): void {
  ensureDataDir();
  const tmpPath = `${STORE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf-8');
  fs.renameSync(tmpPath, STORE_PATH);
}

function toPublicParticipant(p: StoredParticipant) {
  return {
    id: p.id,
    firstName: p.firstName,
    hasGiftHint: p.giftHint.trim().length > 0,
    isClaimed: Boolean(p.pinHash),
    hasSpun: p.hasSpun,
  };
}

function toPublicEvent(e: StoredEvent) {
  return {
    id: e.id,
    epoch: e.epoch,
    title: e.title,
    exchangeDate: e.exchangeDate,
    venue: e.venue,
  };
}

function findParticipant(store: BallotStore, firstName: string, participantId?: string): StoredParticipant | undefined {
  if (participantId) {
    return store.participants.find((p) => p.id === participantId);
  }
  const normalized = firstName.trim().toLowerCase();
  if (!normalized) return undefined;
  return store.participants.find((p) => p.firstName.toLowerCase() === normalized);
}

function getEligibleRecipients(store: BallotStore, giverId: string): StoredParticipant[] {
  return store.participants.filter((p) => !p.isMatched && p.id !== giverId);
}

function getSafeRecipientsForSpin(store: BallotStore, giverId: string): StoredParticipant[] {
  const candidates = getEligibleRecipients(store, giverId);
  if (candidates.length <= 1) {
    return candidates;
  }

  const unspunOthers = store.participants.filter((p) => !p.hasSpun && p.id !== giverId);
  if (unspunOthers.length === 1) {
    const lastSpinner = unspunOthers[0];
    if (!lastSpinner.isMatched) {
      const forcedMatch = candidates.filter((c) => c.id === lastSpinner.id);
      if (forcedMatch.length === 1) {
        return forcedMatch;
      }
    }
  }

  return candidates;
}

function buildBlindedWedgeLabels(count: number): string[] {
  return Array.from({ length: count }, (_, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    return count > 16 ? `#${num}` : `Seal ${num}`;
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Strict anonymity: never expose staff names or claim/spin statuses publicly
  app.get('/api/state', (_req: Request, res: Response) => {
    const store = loadStore();
    const totalStaff = store.participants.length;
    const remainingOnWheel = store.participants.filter((p) => !p.isMatched).length;

    res.json({
      event: toPublicEvent(store.event),
      stats: {
        totalStaff,
        remainingOnWheel,
      },
    });
  });

  app.post('/api/signup', (req: Request, res: Response) => {
    const store = loadStore();
    const rawName = typeof req.body?.firstName === 'string' ? req.body.firstName.trim() : '';
    const rawGiftHint = typeof req.body?.giftHint === 'string' ? req.body.giftHint.trim() : '';
    const rawPin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';

    if (rawName.length < 2) {
      res.status(400).json({ error: 'Please enter your first name.' });
      return;
    }

    const participant = findParticipant(store, rawName);
    if (!participant) {
      res.status(404).json({
        error: 'This name is not registered in the Ezee Santa database. Please check your first name spelling.',
      });
      return;
    }

    if (participant.pinHash) {
      res.status(409).json({
        error: 'This name has already been registered. Use Spin Wheel or My Match with your 4-digit PIN.',
      });
      return;
    }

    if (!/^\d{4}$/.test(rawPin)) {
      res.status(400).json({ error: 'Please choose a 4-digit secret PIN (numbers only).' });
      return;
    }

    if (rawGiftHint.length > 200) {
      res.status(400).json({ error: 'Gift hint must be 200 characters or fewer.' });
      return;
    }

    participant.giftHint = rawGiftHint;
    participant.pinHash = hashSecret(rawPin);
    participant.claimedAt = new Date().toISOString();
    saveStore(store);

    res.status(200).json({
      participant: toPublicParticipant(participant),
    });
  });

  app.post('/api/spin-options', (req: Request, res: Response) => {
    const store = loadStore();
    const rawName = typeof req.body?.firstName === 'string' ? req.body.firstName.trim() : '';
    const participantId = typeof req.body?.participantId === 'string' ? req.body.participantId : '';
    const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';

    const participant = findParticipant(store, rawName, participantId);
    if (!participant) {
      res.status(404).json({
        error: 'This name is not registered in the Ezee Santa database. Please check your first name spelling.',
      });
      return;
    }

    if (!participant.pinHash) {
      res.status(403).json({
        error: 'Please complete the Sign-Up form first to create your 4-digit PIN.',
      });
      return;
    }

    if (!verifySecret(pin, participant.pinHash)) {
      res.status(401).json({ error: 'Incorrect 4-digit PIN. Please try again.' });
      return;
    }

    if (participant.hasSpun) {
      res.status(409).json({
        error: `${participant.firstName}, you have already spun your ballot. Open "My Match" to view your recipient.`,
      });
      return;
    }

    const eligible = getEligibleRecipients(store, participant.id);
    res.json({
      participant: toPublicParticipant(participant),
      eligibleCount: eligible.length,
      wedges: buildBlindedWedgeLabels(eligible.length),
    });
  });

  app.post('/api/spin', (req: Request, res: Response) => {
    const store = loadStore();
    const rawName = typeof req.body?.firstName === 'string' ? req.body.firstName.trim() : '';
    const participantId = typeof req.body?.participantId === 'string' ? req.body.participantId : '';
    const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';

    const giver = findParticipant(store, rawName, participantId);
    if (!giver) {
      res.status(404).json({ error: 'Staff profile not found.' });
      return;
    }

    if (!giver.pinHash) {
      res.status(403).json({ error: 'Complete Sign Up first to set your 4-digit PIN.' });
      return;
    }

    if (!verifySecret(pin, giver.pinHash)) {
      res.status(401).json({ error: 'Incorrect 4-digit PIN.' });
      return;
    }

    if (giver.hasSpun) {
      res.status(409).json({
        error: 'You have already spun your ballot. Check "My Match" to view your recipient.',
      });
      return;
    }

    const totalEligibleCount = getEligibleRecipients(store, giver.id).length;
    const safePool = getSafeRecipientsForSpin(store, giver.id);

    if (safePool.length === 0 || totalEligibleCount === 0) {
      res.status(400).json({ error: 'No eligible colleagues remain on the wheel.' });
      return;
    }

    const chosenIndex = crypto.randomInt(0, safePool.length);
    const chosenRecipient = safePool[chosenIndex];
    const targetWedgeIndex = crypto.randomInt(0, totalEligibleCount);

    const matchedAt = new Date().toISOString();
    giver.hasSpun = true;
    chosenRecipient.isMatched = true;
    store.assignments[giver.id] = {
      giverId: giver.id,
      recipientId: chosenRecipient.id,
      matchedAt,
    };

    saveStore(store);

    const remainingOnWheel = store.participants.filter((p) => !p.isMatched).length;

    res.json({
      targetWedgeIndex,
      totalWedges: totalEligibleCount,
      remainingOnWheel,
      match: {
        firstName: chosenRecipient.firstName,
        giftHint: chosenRecipient.giftHint,
        matchedAt,
      },
    });
  });

  app.post('/api/my-match', (req: Request, res: Response) => {
    const store = loadStore();
    const rawName = typeof req.body?.firstName === 'string' ? req.body.firstName.trim() : '';
    const participantId = typeof req.body?.participantId === 'string' ? req.body.participantId : '';
    const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';

    const participant = findParticipant(store, rawName, participantId);
    if (!participant) {
      res.status(404).json({
        error: 'This name is not registered in the Ezee Santa database. Please check your first name spelling.',
      });
      return;
    }

    if (!participant.pinHash) {
      res.status(403).json({
        error: 'You have not signed up yet. Complete the Sign-Up form first.',
      });
      return;
    }

    if (!verifySecret(pin, participant.pinHash)) {
      res.status(401).json({ error: 'Incorrect 4-digit PIN. Please check and try again.' });
      return;
    }

    if (!participant.hasSpun) {
      res.json({
        hasSpun: false,
        participant: toPublicParticipant(participant),
        match: null,
      });
      return;
    }

    const assignment = store.assignments[participant.id];
    const recipient = assignment
      ? store.participants.find((p) => p.id === assignment.recipientId)
      : undefined;

    if (!assignment || !recipient) {
      res.status(500).json({ error: 'Match record could not be located.' });
      return;
    }

    res.json({
      hasSpun: true,
      participant: toPublicParticipant(participant),
      match: {
        firstName: recipient.firstName,
        giftHint: recipient.giftHint,
        matchedAt: assignment.matchedAt,
      },
    });
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
