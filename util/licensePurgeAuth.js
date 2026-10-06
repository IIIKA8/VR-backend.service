const crypto = require('crypto');

/**
 * Проверка пароля для опасных purge-операций с лицензиями (из LICENSE_PURGE_PASSWORD).
 * @param {unknown} provided
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
function verifyLicensePurgePassword(provided) {
  const expected = process.env.LICENSE_PURGE_PASSWORD;
  if (!expected) {
    return { ok: false, status: 503, error: 'purge_not_configured' };
  }

  const a = Buffer.from(provided == null ? '' : String(provided), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, status: 403, error: 'forbidden' };
  }

  return { ok: true };
}

module.exports = { verifyLicensePurgePassword };
