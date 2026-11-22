const mongoose = require('mongoose');
const { createApp } = require('./app');
const { loadConfig } = require('./config');
const models = require('./models');

async function start() {
  const config = loadConfig();
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  await Promise.all(Object.values(models).map(model => model.init()));
  const server = createApp(config).listen(config.port, '0.0.0.0', () => {
    console.log('Course Enrollment is listening on port ' + config.port);
  });
  server.on('error', error => {
    console.error('Unable to start HTTP server:', error.code || error.name);
    mongoose.disconnect().finally(() => { process.exitCode = 1; });
  });
  function stop() {
    server.close(() => mongoose.disconnect());
  }
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

start().catch(async error => {
  console.error(error.name === 'MongooseServerSelectionError' ? 'Unable to connect to MongoDB.' : error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
