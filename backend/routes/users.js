const express = require('express');
const router = express.Router();
const { getDatabase, getNextId } = require('../lib/db');
const { hashPin, verifyPin } = require('../lib/helpers');
const { generateToken, optionalAuth, authenticateToken } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const { logAudit } = require('../lib/audit');
const {
  getClientIp,
  checkLoginLockout,
  recordLoginFailure,
  clearLoginAttempts
} = require('../lib/rate-limiter');

// GET /api/users
router.get('/', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const users = await db.collection('users')
      .find({}, { projection: { pin: 0 } })
      .sort({ role: 1, id: 1 })
      .toArray();
    res.json(users);
  } catch (err) {
    next(err);
  }
});

// GET /api/users/me (T1: Get current authenticated user profile)
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const db = await getDatabase();
    const user = await db.collection('users').findOne({ id: req.user.id }, { projection: { pin: 0 } });
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// GET /api/users/lockout-status (Must be before /:id)
router.get('/lockout-status', async (req, res, next) => {
  try {
    const clientIp = getClientIp(req);
    const lockout = await checkLoginLockout(clientIp);
    res.json(lockout);
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:id
router.get('/:id', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const user = await db.collection('users').findOne({ id }, { projection: { pin: 0 } });
    if (!user) return res.status(404).json(null);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// POST /api/users
router.post('/', optionalAuth, validate(schemas.user), async (req, res, next) => {
  try {
    const db = await getDatabase();
    const data = req.body;
    const nextId = await getNextId(db, 'users');
    const newUser = {
      id: nextId,
      username: String(data.username).trim().toLowerCase(),
      name: String(data.name).trim(),
      role: data.role || 'staff',
      pin: hashPin(data.pin || '0000'),
      phone: data.phone || '',
      status: data.status || 'active',
      created_at: new Date()
    };
    await db.collection('users').insertOne(newUser);
    const { pin: _p, ...safe } = newUser;

    await logAudit({
      action: 'USER_CREATE',
      entity: 'users',
      entity_id: nextId,
      user: req.user,
      description: `Tạo tài khoản người dùng mới: ${safe.name} (${safe.username}) - Vai trò: ${safe.role}`,
      details: safe,
      req
    });

    res.json(safe);
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:id
router.put('/:id', optionalAuth, validate(schemas.user), async (req, res, next) => {
  try {
    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const data = req.body;
    const updateDoc = {};
    if (data.username !== undefined) updateDoc.username = String(data.username).trim().toLowerCase();
    if (data.name !== undefined) updateDoc.name = String(data.name).trim();
    if (data.role !== undefined) updateDoc.role = data.role;
    if (data.phone !== undefined) updateDoc.phone = data.phone;
    if (data.status !== undefined) updateDoc.status = data.status;
    if (data.pin) updateDoc.pin = hashPin(data.pin);

    await db.collection('users').updateOne({ id }, { $set: updateDoc });
    const updated = await db.collection('users').findOne({ id }, { projection: { pin: 0 } });

    await logAudit({
      action: 'USER_UPDATE',
      entity: 'users',
      entity_id: id,
      user: req.user,
      description: `Cập nhật thông tin người dùng #${id}: ${updated?.name}`,
      details: updateDoc,
      req
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id
router.delete('/:id', optionalAuth, async (req, res, next) => {
  try {
    if (req.user && req.user.role === 'staff') {
      return res.status(403).json({ error: 'Nhân viên không có quyền xóa tài khoản người dùng.' });
    }

    const db = await getDatabase();
    const id = parseInt(req.params.id, 10);
    const user = await db.collection('users').findOne({ id });
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    if (user.role === 'owner') {
      const ownerCount = await db.collection('users').countDocuments({ role: 'owner' });
      if (ownerCount <= 1) return res.status(400).json({ error: 'Không thể xóa tài khoản Chủ Shop duy nhất' });
    }
    await db.collection('users').deleteOne({ id });

    await logAudit({
      action: 'USER_DELETE',
      entity: 'users',
      entity_id: id,
      user: req.user,
      description: `Xóa tài khoản người dùng: ${user.name} (${user.username})`,
      details: { id: user.id, username: user.username, role: user.role },
      req
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/authenticate
router.post('/authenticate', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const { usernameOrPin, pin, password, username, mode, userId } = req.body;
    const clientIp = getClientIp(req);

    // 1. Check if client is locked out
    const lockout = await checkLoginLockout(clientIp);
    if (lockout.locked) {
      await logAudit({
        action: 'USER_LOGIN_BLOCKED',
        entity: 'auth',
        entity_id: username || usernameOrPin || '',
        description: `Đăng nhập bị chặn do nhập sai quá 5 lần (IP: ${clientIp})`,
        req
      });
      return res.status(429).json({
        error: `Bạn đã nhập sai quá 5 lần! Để đảm bảo an toàn, hệ thống tạm khóa ${lockout.retryAfter} giây.`,
        locked: true,
        retryAfter: lockout.retryAfter
      });
    }

    const activeUsers = await db.collection('users').find({ status: 'active' }).toArray();
    let authenticatedUser = null;

    // Mode A: Admin PIN login
    if (mode === 'admin' || (usernameOrPin === 'admin' && pin !== undefined) || (pin !== undefined && !username && !usernameOrPin && !userId)) {
      const adminPin = String(pin || usernameOrPin || '').trim();
      const owners = activeUsers.filter(u => u.role === 'owner');
      for (const o of owners) {
        if (verifyPin(adminPin, o.pin)) {
          authenticatedUser = o;
          break;
        }
      }
    }
    // Mode B: Staff / User login by Username and Password
    else if (mode === 'staff' || username) {
      const inputUser = String(username || usernameOrPin || '').trim().toLowerCase();
      const inputPass = String(password || pin || '').trim();
      const user = activeUsers.find(u => u.username.toLowerCase() === inputUser);
      if (user && verifyPin(inputPass, user.pin)) {
        authenticatedUser = user;
      }
    }
    // Mode C: Legacy / Switch Ca / Lock Screen PIN
    else if (pin === undefined) {
      for (const u of activeUsers) {
        if (verifyPin(usernameOrPin, u.pin)) {
          authenticatedUser = u;
          break;
        }
      }
    } else {
      const targetUser = userId
        ? activeUsers.find(u => u.id === Number(userId))
        : activeUsers.find(u => u.username === usernameOrPin || (usernameOrPin !== undefined && u.id === Number(usernameOrPin)));
      if (targetUser && verifyPin(pin, targetUser.pin)) {
        authenticatedUser = targetUser;
      }
    }

    // Check result
    if (!authenticatedUser) {
      const failInfo = await recordLoginFailure(clientIp);
      await logAudit({
        action: 'USER_LOGIN_FAILED',
        entity: 'auth',
        entity_id: username || usernameOrPin || '',
        description: `Đăng nhập thất bại (Còn ${failInfo.remainingAttempts} lần thử, IP: ${clientIp})`,
        req
      });

      if (failInfo.locked) {
        return res.status(429).json({
          error: `Bạn đã nhập sai quá 5 lần! Để đảm bảo an toàn, hệ thống tạm khóa ${failInfo.retryAfter} giây.`,
          locked: true,
          retryAfter: failInfo.retryAfter
        });
      }
      return res.status(401).json({
        error: `Thông tin đăng nhập không chính xác. Bạn còn ${failInfo.remainingAttempts} lần thử.`,
        locked: false,
        remainingAttempts: failInfo.remainingAttempts
      });
    }

    // Success -> Clear failed attempts
    await clearLoginAttempts(clientIp);
    const { pin: _p, ...safeUser } = authenticatedUser;
    
    // S3: Issue JWT Token on authentication
    const token = generateToken(safeUser);

    await logAudit({
      action: 'USER_LOGIN',
      entity: 'auth',
      entity_id: safeUser.id,
      user: safeUser,
      description: `Đăng nhập thành công: ${safeUser.name} (${safeUser.username}) - ${safeUser.role}`,
      req
    });

    res.json({ ...safeUser, token });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/refresh-token (T1: Refresh Token)
router.post('/refresh-token', authenticateToken, async (req, res, next) => {
  try {
    const db = await getDatabase();
    const user = await db.collection('users').findOne({ id: req.user.id }, { projection: { pin: 0 } });
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'Tài khoản không tồn tại hoặc đã bị khóa' });
    }
    const token = generateToken(user);
    res.json({ token, user });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/logout (T1: Logout & Audit)
router.post('/logout', optionalAuth, async (req, res) => {
  if (req.user) {
    await logAudit({
      action: 'USER_LOGOUT',
      entity: 'auth',
      entity_id: req.user.id,
      user: req.user,
      description: `Người dùng ${req.user.name} (${req.user.username}) đã đăng xuất`,
      req
    });
  }
  res.json({ success: true, message: 'Đã đăng xuất an toàn' });
});

// POST /api/users/verify-pin
router.post('/verify-pin', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const { pin } = req.body;
    const owners = await db.collection('users').find({ role: 'owner', status: 'active' }).toArray();
    for (const o of owners) {
      if (verifyPin(pin, o.pin)) return res.json({ valid: true });
    }
    res.json({ valid: false });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
