const express = require('express');
const mongoose = require('mongoose');
const { showDashboard } = require('../controllers/dashboard');
const { authController } = require('../controllers/auth');
const { resources, recordsController, notFound } = require('../controllers/records');
const enrollments = require('../controllers/enrollments');
const teaching = require('../controllers/teaching');
const { requireUser, requireRole, authLimiter } = require('../middleware/security');

function idParam(req, res, next, value) {
  return mongoose.isObjectIdOrHexString(value) ? next() : notFound(res);
}

function routes(security) {
  const router = express.Router();
  const auth = authController(security);
  const admin = requireRole('admin');
  router.param('id', idParam);
  router.param('studentId', idParam);
  router.get('/', (req, res) => res.redirect(req.user ? '/dashboard' : '/login'));
  router.get('/login', auth.showLogin);
  router.post('/login', authLimiter, auth.login);
  router.get('/register', auth.showRegister);
  router.post('/register', authLimiter, auth.register);
  router.post('/logout', requireUser, auth.logout);
  router.get('/dashboard', requireUser, showDashboard);

  for (const key of Object.keys(resources)) {
    const base = '/' + key;
    const crud = recordsController(key);
    router.use(base, requireUser);
    router.get(base, crud.list);
    router.get(base + '/new', admin, crud.createForm);
    router.post(base, admin, crud.create);
    router.get(base + '/:id', crud.details);
    router.get(base + '/:id/edit', admin, crud.editForm);
    router.post(base + '/:id/edit', admin, crud.update);
    router.get(base + '/:id/delete', admin, crud.deleteForm);
    router.post(base + '/:id/delete', admin, crud.remove);
  }

  router.get('/teaching/:id', requireUser, (req, res) => teaching.showAssignments(req, res));
  router.post('/teaching/:id', requireUser, admin, teaching.assign);

  router.use('/enrollments', requireUser);
  router.get('/enrollments', enrollments.list);
  router.get('/enrollments/:id', (req, res) => enrollments.showCourse(req, res));
  router.post('/enrollments/:id', enrollments.add);
  router.post('/enrollments/:id/students/:studentId/remove', enrollments.remove);
  return router;
}

module.exports = { routes };
