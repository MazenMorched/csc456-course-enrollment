const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { security } = require('./middleware/security');
const { routes } = require('./routes');

function createApp(config) {
  const app = express();
  if (config.production) app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.use(helmet({
    contentSecurityPolicy: { directives: { upgradeInsecureRequests: config.production ? [] : null } }
  }));
  app.use('/assets', express.static(path.join(__dirname, 'public')));
  app.get('/health', async (req, res) => {
    try {
      await mongoose.connection.db.command({ ping: 1 }, { timeoutMS: 2500 });
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.locals.currentUser = null;
    res.locals.path = req.path;
    res.locals.registered = req.query.registered === '1';
    next();
  });
  app.use(express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 25 }));
  app.use((req, res, next) => {
    req.body ??= {};
    next();
  });
  app.use(cookieParser(config.secret));
  const guards = security(config);
  app.use(guards.identify, guards.csrf, routes(guards));
  app.use((req, res) => res.status(404).render('error', {
    title: 'Page unavailable', message: 'The requested page could not be found.',
    backUrl: '/dashboard', backLabel: 'Return to dashboard'
  }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = [400, 413, 415].includes(error.status) ? error.status : 500;
    if (status === 500) console.error('Request failed:', error.name);
    return res.status(status).render('error', {
      title: status === 500 ? 'Something went wrong' : 'Request could not be read',
      message: status === 500 ? 'Please try again in a moment.' : 'Open the form and submit it again.',
      backUrl: '/dashboard', backLabel: 'Return to dashboard'
    });
  });
  return app;
}

module.exports = { createApp };
