import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

export const STAFF_NAMES = [
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

export class ServiceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const CURRENT_ROSTER_VERSION = 3;
const REDIS_STORE_KEY = 'ezee_santa:store:v3';
const DATA_DIR = path.resolve(process.cwd(), 'data');
const LOCAL_STORE_PATH = path.join(DATA_DIR, 'ballot-store.json');

let pgPool: Pool | null = null;
let pgSchemaReady = false;

function getPostgresUrl(): string | null {
  return (
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    null
  );
}

function getUpstashConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    return { url: url.replace(/\/$/, ''), token };
  }
  return null;
}

function getPool(): Pool {
  if (!pgPool) {
    const connectionString = getPostgresUrl();
    if (!connectionString) {
      throw new ServiceError(503, 'Postgres connection string is missing.');
    }
    const isLocal =
      connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    pgPool = new Pool({
      connectionString,
      max: 5,
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
    });
  }
  return pgPool;
}

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

function normalizeStore(raw: unknown): BallotStore {
  if (!raw || typeof raw !== 'object') {
    return createDefaultStore();
  }
  const parsed = raw as BallotStore;
  if (
    parsed.rosterVersion !== CURRENT_ROSTER_VERSION ||
    !parsed.event ||
    !Array.isArray(parsed.participants) ||
    !parsed.assignments
  ) {
    return createDefaultStore();
  }
  return parsed;
}

// Local file adapter (dev / single-node fallback)
function loadLocalStore(): BallotStore {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOCAL_STORE_PATH)) {
    const initial = createDefaultStore();
    saveLocalStore(initial);
    return initial;
  }
  try {
    const raw = fs.readFileSync(LOCAL_STORE_PATH, 'utf-8');
    const store = normalizeStore(JSON.parse(raw));
    return store;
  } catch {
    const fallback = createDefaultStore();
    saveLocalStore(fallback);
    return fallback;
  }
}

function saveLocalStore(store: BallotStore): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${LOCAL_STORE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf-8');
  fs.renameSync(tmpPath, LOCAL_STORE_PATH);
}

// Upstash / Vercel KV REST adapter
async function loadUpstashStore(cfg: { url: string; token: string }): Promise<BallotStore> {
  const res = await fetch(`${cfg.url}/get/${encodeURIComponent(REDIS_STORE_KEY)}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new ServiceError(502, 'Failed to read ballot state from Redis store.');
  }
  const payload = (await res.json()) as { result?: string | null };
  if (!payload.result) {
    const initial = createDefaultStore();
    await saveUpstashStore(cfg, initial);
    return initial;
  }
  try {
    const parsed = JSON.parse(payload.result);
    const normalized = normalizeStore(parsed);
    if (normalized !== parsed && (parsed as BallotStore)?.rosterVersion !== CURRENT_ROSTER_VERSION) {
      await saveUpstashStore(cfg, normalized);
    }
    return normalized;
  } catch {
    const fallback = createDefaultStore();
    await saveUpstashStore(cfg, fallback);
    return fallback;
  }
}

async function saveUpstashStore(
  cfg: { url: string; token: string },
  store: BallotStore,
): Promise<void> {
  const res = await fetch(`${cfg.url}/set/${encodeURIComponent(REDIS_STORE_KEY)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(JSON.stringify(store)),
  });
  if (!res.ok) {
    throw new ServiceError(502, 'Failed to save ballot state to Redis store.');
  }
}

// Postgres adapter with row-level locking for concurrent spins
async function withPostgresTransaction<T>(
  mutator: (store: BallotStore) => { result: T; changed: boolean },
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    if (!pgSchemaReady) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS ezee_santa_state (
          id TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      pgSchemaReady = true;
    }

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO ezee_santa_state (id, data)
       VALUES ('default', $1::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(createDefaultStore())],
    );

    const selectRes = await client.query<{ data: unknown }>(
      `SELECT data FROM ezee_santa_state WHERE id = 'default' FOR UPDATE`,
    );

    const raw = selectRes.rows[0]?.data;
    const store = normalizeStore(raw);
    const { result, changed } = mutator(store);

    if (changed || (raw as BallotStore)?.rosterVersion !== CURRENT_ROSTER_VERSION) {
      await client.query(
        `UPDATE ezee_santa_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 'default'`,
        [JSON.stringify(store)],
      );
    }

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function runStoreOperation<T>(
  mutator: (store: BallotStore) => { result: T; changed: boolean },
): Promise<T> {
  if (getPostgresUrl()) {
    return withPostgresTransaction(mutator);
  }

  const upstash = getUpstashConfig();
  if (upstash) {
    const store = await loadUpstashStore(upstash);
    const { result, changed } = mutator(store);
    if (changed) {
      await saveUpstashStore(upstash, store);
    }
    return result;
  }

  if (process.env.VERCEL) {
    throw new ServiceError(
      503,
      'Database not configured on Vercel. Connect a Postgres (Neon/Supabase) or Upstash Redis database in Vercel Storage and redeploy.',
    );
  }

  const store = loadLocalStore();
  const { result, changed } = mutator(store);
  if (changed) {
    saveLocalStore(store);
  }
  return result;
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

function findParticipant(
  store: BallotStore,
  firstName: string,
  participantId?: string,
): StoredParticipant | undefined {
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

export async function getPublicState() {
  return runStoreOperation((store) => {
    const totalStaff = store.participants.length;
    const remainingOnWheel = store.participants.filter((p) => !p.isMatched).length;
    return {
      changed: false,
      result: {
        event: toPublicEvent(store.event),
        stats: {
          totalStaff,
          remainingOnWheel,
        },
      },
    };
  });
}

export async function signupParticipant(body: {
  firstName?: unknown;
  giftHint?: unknown;
  pin?: unknown;
}) {
  const rawName = typeof body?.firstName === 'string' ? body.firstName.trim() : '';
  const rawGiftHint = typeof body?.giftHint === 'string' ? body.giftHint.trim() : '';
  const rawPin = typeof body?.pin === 'string' ? body.pin.trim() : '';

  if (rawName.length < 2) {
    throw new ServiceError(400, 'Please enter your first name.');
  }
  if (!/^\d{4}$/.test(rawPin)) {
    throw new ServiceError(400, 'Please choose a 4-digit secret PIN (numbers only).');
  }
  if (rawGiftHint.length > 200) {
    throw new ServiceError(400, 'Gift hint must be 200 characters or fewer.');
  }

  return runStoreOperation((store) => {
    const participant = findParticipant(store, rawName);
    if (!participant) {
      throw new ServiceError(
        404,
        'This name is not registered in the Ezee Santa database. Please check your first name spelling.',
      );
    }

    if (participant.pinHash) {
      throw new ServiceError(
        409,
        'This name has already been registered. Use Spin Wheel or My Match with your 4-digit PIN.',
      );
    }

    participant.giftHint = rawGiftHint;
    participant.pinHash = hashSecret(rawPin);
    participant.claimedAt = new Date().toISOString();

    return {
      changed: true,
      result: {
        participant: toPublicParticipant(participant),
      },
    };
  });
}

export async function getSpinOptions(body: {
  firstName?: unknown;
  participantId?: unknown;
  pin?: unknown;
}) {
  const rawName = typeof body?.firstName === 'string' ? body.firstName.trim() : '';
  const participantId = typeof body?.participantId === 'string' ? body.participantId : '';
  const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';

  return runStoreOperation((store) => {
    const participant = findParticipant(store, rawName, participantId);
    if (!participant) {
      throw new ServiceError(
        404,
        'This name is not registered in the Ezee Santa database. Please check your first name spelling.',
      );
    }

    if (!participant.pinHash) {
      throw new ServiceError(
        403,
        'Please complete the Sign-Up form first to create your 4-digit PIN.',
      );
    }

    if (!verifySecret(pin, participant.pinHash)) {
      throw new ServiceError(401, 'Incorrect 4-digit PIN. Please try again.');
    }

    if (participant.hasSpun) {
      throw new ServiceError(
        409,
        `${participant.firstName}, you have already spun your ballot. Open "My Match" to view your recipient.`,
      );
    }

    const eligible = getEligibleRecipients(store, participant.id);
    return {
      changed: false,
      result: {
        participant: toPublicParticipant(participant),
        eligibleCount: eligible.length,
        wedges: buildBlindedWedgeLabels(eligible.length),
      },
    };
  });
}

export async function executeSpin(body: {
  firstName?: unknown;
  participantId?: unknown;
  pin?: unknown;
}) {
  const rawName = typeof body?.firstName === 'string' ? body.firstName.trim() : '';
  const participantId = typeof body?.participantId === 'string' ? body.participantId : '';
  const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';

  return runStoreOperation((store) => {
    const giver = findParticipant(store, rawName, participantId);
    if (!giver) {
      throw new ServiceError(404, 'Staff profile not found.');
    }

    if (!giver.pinHash) {
      throw new ServiceError(403, 'Complete Sign Up first to set your 4-digit PIN.');
    }

    if (!verifySecret(pin, giver.pinHash)) {
      throw new ServiceError(401, 'Incorrect 4-digit PIN.');
    }

    if (giver.hasSpun) {
      throw new ServiceError(
        409,
        'You have already spun your ballot. Check "My Match" to view your recipient.',
      );
    }

    const totalEligibleCount = getEligibleRecipients(store, giver.id).length;
    const safePool = getSafeRecipientsForSpin(store, giver.id);

    if (safePool.length === 0 || totalEligibleCount === 0) {
      throw new ServiceError(400, 'No eligible colleagues remain on the wheel.');
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

    const remainingOnWheel = store.participants.filter((p) => !p.isMatched).length;

    return {
      changed: true,
      result: {
        targetWedgeIndex,
        totalWedges: totalEligibleCount,
        remainingOnWheel,
        match: {
          firstName: chosenRecipient.firstName,
          giftHint: chosenRecipient.giftHint,
          matchedAt,
        },
      },
    };
  });
}

export async function lookupMyMatch(body: {
  firstName?: unknown;
  participantId?: unknown;
  pin?: unknown;
}) {
  const rawName = typeof body?.firstName === 'string' ? body.firstName.trim() : '';
  const participantId = typeof body?.participantId === 'string' ? body.participantId : '';
  const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';

  return runStoreOperation<{
    hasSpun: boolean;
    participant: ReturnType<typeof toPublicParticipant>;
    match: { firstName: string; giftHint: string; matchedAt: string } | null;
  }>((store) => {
    const participant = findParticipant(store, rawName, participantId);
    if (!participant) {
      throw new ServiceError(
        404,
        'This name is not registered in the Ezee Santa database. Please check your first name spelling.',
      );
    }

    if (!participant.pinHash) {
      throw new ServiceError(
        403,
        'You have not signed up yet. Complete the Sign-Up form first.',
      );
    }

    if (!verifySecret(pin, participant.pinHash)) {
      throw new ServiceError(401, 'Incorrect 4-digit PIN. Please check and try again.');
    }

    if (!participant.hasSpun) {
      return {
        changed: false,
        result: {
          hasSpun: false,
          participant: toPublicParticipant(participant),
          match: null,
        },
      };
    }

    const assignment = store.assignments[participant.id];
    const recipient = assignment
      ? store.participants.find((p) => p.id === assignment.recipientId)
      : undefined;

    if (!assignment || !recipient) {
      throw new ServiceError(500, 'Match record could not be located.');
    }

    return {
      changed: false,
      result: {
        hasSpun: true,
        participant: toPublicParticipant(participant),
        match: {
          firstName: recipient.firstName,
          giftHint: recipient.giftHint,
          matchedAt: assignment.matchedAt,
        },
      },
    };
  });
}
