const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { loadConfig } = require('../config');
const { User } = require('../models');
const { validPassword, BCRYPT_COST } = require('../controllers/auth');

async function run() {
  const { mongoUri } = loadConfig();
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_NAME?.trim() || !ADMIN_EMAIL?.trim() || !validPassword(ADMIN_PASSWORD)) {
    throw new Error('Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD (12 characters minimum, 72 bytes maximum).');
  }
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  await User.init();
  const existing = await User.findOne({ email: ADMIN_EMAIL.trim().toLowerCase() });
  if (existing) {
    if (existing.role === 'admin') {
      console.log('Administrator already exists.');
      return;
    }
    throw new Error('That email already belongs to a staff account. Choose a different email.');
  }
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_COST);
  await User.create({ name: ADMIN_NAME, email: ADMIN_EMAIL, passwordHash, role: 'admin' });
  console.log('Administrator created.');
}

run().catch(error => {
  console.error(error.name === 'MongooseServerSelectionError' ? 'Unable to connect to MongoDB.' : error.message);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
