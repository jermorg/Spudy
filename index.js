require('dotenv').config();

const { startWeb } = require('./src/web');
const { startBot } = require('./src/bot');

startWeb();
startBot();