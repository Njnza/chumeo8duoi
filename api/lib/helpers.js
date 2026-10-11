const crypto = require('crypto');

// ==================== PIN VERIFICATION & HASHING ====================
function hashPin(pin, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPin(pin, storedPin) {
  if (!storedPin) return false;
  const pinStr = String(pin).trim();
  if (!storedPin.startsWith('scrypt:')) return pinStr === storedPin;
  const parts = storedPin.split(':');
  if (parts.length !== 3) return false;
  const salt = parts[1];
  const expectedHash = parts[2];
  try {
    const computedHash = crypto.scryptSync(pinStr, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(computedHash, 'hex'), Buffer.from(expectedHash, 'hex'));
  } catch (_) {
    return false;
  }
}

// ==================== VIETNAMESE UNACCENTED SEARCH HELPERS ====================
const VIETNAMESE_MAP = {
  a: '[aàáảãạăằắẳẵặâầấẩẫậ]',
  e: '[eèéẻẽẹêềếểễệ]',
  i: '[iìíỉĩị]',
  o: '[oòóỏõọôồốổỗộơờớởỡợ]',
  u: '[uùúủũụưừứửữự]',
  y: '[yỳýỷỹỵ]',
  d: '[dđ]',
};

function removeVietnameseTones(str) {
  if (!str) return '';
  str = String(str).toLowerCase();
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  str = str.replace(/đ/g, 'd');
  str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, '');
  str = str.replace(/\u02C6|\u0306|\u031B/g, '');
  return str.trim();
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildVietnameseRegex(term) {
  if (!term) return new RegExp('', 'i');
  const normalized = removeVietnameseTones(term);
  let pattern = '';
  for (const ch of normalized) {
    if (VIETNAMESE_MAP[ch]) {
      pattern += VIETNAMESE_MAP[ch];
    } else if (/[a-z0-9]/i.test(ch)) {
      pattern += ch;
    } else if (/\s+/.test(ch)) {
      pattern += '\\s+';
    } else {
      pattern += escapeRegex(ch);
    }
  }
  return new RegExp(pattern, 'i');
}

function buildVietnameseSearchQuery(searchString, fields = ['name', 'sku', 'barcode']) {
  if (!searchString || !searchString.trim()) return null;
  const tokens = searchString.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  return {
    $and: tokens.map(token => {
      const reg = buildVietnameseRegex(token);
      return {
        $or: fields.map(f => ({ [f]: reg }))
      };
    })
  };
}

function generateOrderCode(prefix = 'HD') {
  const now = new Date();
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${y}${m}${d}-${rand}`;
}

module.exports = {
  hashPin,
  verifyPin,
  removeVietnameseTones,
  escapeRegex,
  buildVietnameseRegex,
  buildVietnameseSearchQuery,
  generateOrderCode
};
