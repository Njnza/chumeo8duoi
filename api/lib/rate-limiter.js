const { getDatabase } = require('./db');

// In-memory fallback if DB is not ready
const memoryStore = new Map();

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    '127.0.0.1'
  );
}

async function checkLoginLockout(key) {
  try {
    const db = await getDatabase();
    const record = await db.collection('login_attempts').findOne({ _id: key });
    if (!record) return { locked: false, remainingAttempts: 5 };

    const now = Date.now();
    if (record.lockedUntil && record.lockedUntil > now) {
      const secondsLeft = Math.ceil((record.lockedUntil - now) / 1000);
      return { locked: true, retryAfter: secondsLeft };
    }

    if (record.lockedUntil && record.lockedUntil <= now) {
      await db.collection('login_attempts').deleteOne({ _id: key });
      return { locked: false, remainingAttempts: 5 };
    }

    return { locked: false, remainingAttempts: Math.max(0, 5 - (record.count || 0)) };
  } catch (err) {
    // Memory fallback
    const record = memoryStore.get(key);
    if (!record) return { locked: false, remainingAttempts: 5 };
    const now = Date.now();
    if (record.lockedUntil && record.lockedUntil > now) {
      return { locked: true, retryAfter: Math.ceil((record.lockedUntil - now) / 1000) };
    }
    return { locked: false, remainingAttempts: Math.max(0, 5 - (record.count || 0)) };
  }
}

async function recordLoginFailure(key) {
  const now = Date.now();
  try {
    const db = await getDatabase();
    const existing = await db.collection('login_attempts').findOne({ _id: key });
    let count = 1;

    if (existing && (!existing.lockedUntil || existing.lockedUntil <= now)) {
      count = (existing.count || 0) + 1;
    }

    let lockedUntil = null;
    let locked = false;
    let retryAfter = 0;

    if (count >= 5) {
      lockedUntil = now + 60 * 1000;
      locked = true;
      retryAfter = 60;
    }

    await db.collection('login_attempts').updateOne(
      { _id: key },
      {
        $set: {
          count,
          lockedUntil,
          updated_at: new Date()
        },
        $setOnInsert: { created_at: new Date() }
      },
      { upsert: true }
    );

    return { locked, retryAfter, remainingAttempts: Math.max(0, 5 - count) };
  } catch (err) {
    // Memory fallback
    let record = memoryStore.get(key);
    if (!record || (record.lockedUntil && record.lockedUntil <= now)) {
      record = { count: 1, lockedUntil: null };
    } else {
      record.count += 1;
    }
    if (record.count >= 5) {
      record.lockedUntil = now + 60 * 1000;
      memoryStore.set(key, record);
      return { locked: true, retryAfter: 60, remainingAttempts: 0 };
    }
    memoryStore.set(key, record);
    return { locked: false, retryAfter: 0, remainingAttempts: 5 - record.count };
  }
}

async function clearLoginAttempts(key) {
  memoryStore.delete(key);
  try {
    const db = await getDatabase();
    await db.collection('login_attempts').deleteOne({ _id: key });
  } catch (_) {}
}

module.exports = {
  getClientIp,
  checkLoginLockout,
  recordLoginFailure,
  clearLoginAttempts
};
