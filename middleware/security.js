const { randomBytes, timingSafeEqual } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const { isObjectIdOrHexString } = require('mongoose');
const { LoginSession, User } = require('../models');

const TOKEN_AGE_SECONDS = 8 * 60 * 60;
const tokenOptions = { algorithm: 'HS256', issuer: 'course-enrollment', audience: 'dashboard' };

function security(config) {
  const prefix = config.production ? '__Host-' : '';
  const sessionCookie = prefix + 'enrollment-session';
  const csrfCookie = prefix + 'enrollment-csrf';
  const cookieOptions = { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/' };

  function setCsrf(res) {
    const token = randomBytes(32).toString('hex');
    res.cookie(csrfCookie, token, { ...cookieOptions, signed: true, maxAge: TOKEN_AGE_SECONDS * 1000 });
    return token;
  }

  function csrf(req, res, next) {
    const token = req.signedCookies[csrfCookie];
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.locals.csrfToken = token || setCsrf(res);
      return next();
    }
    const supplied = req.body?._csrf;
    if (!token || typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied) ||
        !timingSafeEqual(Buffer.from(token), Buffer.from(supplied))) {
      return res.status(403).render('error', {
        title: 'Form expired', message: 'Open the form again and retry.',
        backUrl: '/dashboard', backLabel: 'Return to dashboard'
      });
    }
    res.locals.csrfToken = token;
    next();
  }

  async function identify(req, res, next) {
    res.locals.currentUser = null;
    const token = req.cookies[sessionCookie];
    if (!token) return next();

    let claims;
    try {
      claims = jwt.verify(token, config.secret, {
        algorithms: [tokenOptions.algorithm], issuer: tokenOptions.issuer, audience: tokenOptions.audience
      });
    } catch {
      return next();
    }
    if (!isObjectIdOrHexString(claims.sub) || !isObjectIdOrHexString(claims.jti)) return next();

    const session = await LoginSession.exists({
      _id: claims.jti, user: claims.sub, expiresAt: { $gt: new Date() }
    });
    if (session) {
      req.user = await User.findById(claims.sub).lean();
      req.sessionId = claims.jti;
      res.locals.currentUser = req.user;
    }
    next();
  }

  async function beginSession(req, res, user) {
    const session = await LoginSession.create({
      user: user.id, expiresAt: new Date(Date.now() + TOKEN_AGE_SECONDS * 1000)
    });
    const token = jwt.sign({}, config.secret, {
      ...tokenOptions, subject: user.id, jwtid: session.id, expiresIn: TOKEN_AGE_SECONDS
    });
    res.cookie(sessionCookie, token, { ...cookieOptions, maxAge: TOKEN_AGE_SECONDS * 1000 });
    setCsrf(res);
  }

  async function endSession(req, res) {
    await LoginSession.deleteOne({ _id: req.sessionId });
    res.clearCookie(sessionCookie, cookieOptions);
    setCsrf(res);
  }

  return { csrf, identify, beginSession, endSession };
}

function requireUser(req, res, next) {
  if (req.user) return next();
  return res.redirect(303, '/login');
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role === role) return next();
    return res.status(403).render('error', {
      title: 'Access denied', message: 'This action requires an administrator account.',
      backUrl: '/dashboard', backLabel: 'Return to dashboard'
    });
  };
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => res.status(429).render('error', {
    title: 'Too many attempts', message: 'Wait a few minutes and try again.',
    backUrl: '/login', backLabel: 'Return to sign in'
  })
});

module.exports = { security, requireUser, requireRole, authLimiter };
