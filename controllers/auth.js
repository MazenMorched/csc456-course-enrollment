const bcrypt = require('bcrypt');
const { User } = require('../models');

const BCRYPT_COST = 12;
const fallbackHash = bcrypt.hash('placeholder used for timing', BCRYPT_COST);
const text = value => typeof value === 'string' ? value.trim() : '';

function validPassword(value) {
  return typeof value === 'string' && value.length >= 12 && Buffer.byteLength(value) <= 72;
}

function authController({ beginSession, endSession }) {
  function form(res, mode, values = {}, error = '', status = 200) {
    return res.status(status).render('auth/form', {
      title: mode === 'login' ? 'Sign in' : 'Create account', mode, values, error
    });
  }
  return {
    showLogin: (req, res) => req.user ? res.redirect('/dashboard') : form(res, 'login'),
    showRegister: (req, res) => req.user ? res.redirect('/dashboard') : form(res, 'register'),
    async login(req, res) {
      if (req.user) return res.redirect(303, '/dashboard');
      const email = text(req.body.email).toLowerCase();
      const { password } = req.body;
      const failure = () => form(res, 'login', { email }, 'Email or password is incorrect.', 401);
      if (!validPassword(password) || email.length > 254) return failure();
      const user = await User.findOne({ email }).select('+passwordHash');
      const matches = await bcrypt.compare(password, user?.passwordHash || await fallbackHash);
      if (!user || !matches) return failure();
      await beginSession(req, res, user);
      return res.redirect(303, '/dashboard');
    },
    async register(req, res) {
      if (req.user) return res.redirect(303, '/dashboard');
      const values = { name: text(req.body.name), email: text(req.body.email).toLowerCase() };
      const { password } = req.body;
      if (!validPassword(password)) {
        return form(res, 'register', values, 'Use at least 12 characters and at most 72 bytes.', 422);
      }
      try {
        const user = new User({ ...values, role: 'staff' });
        await user.validate(['name', 'email', 'role']);
        user.passwordHash = await bcrypt.hash(password, BCRYPT_COST);
        await user.save();
      } catch (error) {
        if (error.code === 11000) return form(res, 'register', values, 'This email already has an account.', 409);
        if (error.name === 'ValidationError') {
          return form(res, 'register', values, 'Enter a name and valid email address.', 422);
        }
        throw error;
      }
      return res.redirect(303, '/login?registered=1');
    },
    async logout(req, res) {
      await endSession(req, res);
      return res.redirect(303, '/login');
    }
  };
}

module.exports = { authController, validPassword, BCRYPT_COST };
