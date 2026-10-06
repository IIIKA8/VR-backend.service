/**
 * Секрет сессии Express: обязателен в production, без захардкоженного fallback.
 * @returns {string}
 */
function getSessionSecret() {
  const secret = process.env.SESS_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (secret && String(secret).length >= 32) {
    return secret;
  }

  if (isProd) {
    throw new Error(
      'SESS_SECRET must be set in production (at least 32 characters). See .env.example'
    );
  }

  if (secret) {
    return secret;
  }

  return 'dev-only-insecure-session-secret';
}

module.exports = { getSessionSecret };
