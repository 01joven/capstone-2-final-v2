// Small fixed-window, in-memory rate limiter (no extra dependency).
// Single-instance only: limits reset on restart and are not shared across instances.
const buckets = new Map();

const createRateLimiter = ({ windowMs, max, keyFn, message }) => {
  return (req, res, next) => {
    const key = keyFn(req);
    if (!key) return next();

    const now = Date.now();
    let entry = buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ message });
    }
    return next();
  };
};

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}, 60 * 1000);
sweep.unref();

const emailFrom = (req) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  return email ? `email:${email}` : null;
};

const authenticatedKey = (req) => {
  if (req.user && Number.isSafeInteger(req.user.id)) return `user:${req.user.id}`;
  return req.ip ? `ip:${req.ip}` : null;
};

const authenticatedLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 200,
  keyFn: authenticatedKey,
  message: 'Too many requests. Please slow down and try again later.',
});

module.exports = { createRateLimiter, emailFrom, authenticatedKey, authenticatedLimit };
