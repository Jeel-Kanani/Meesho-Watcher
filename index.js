const { appConfig } = require('./src/config/appConfig');
const { spawn } = require('child_process');

async function main() {
  console.log('Opening shop page in the default browser...');

  const browserProcess = spawn('cmd', ['/c', 'start', '', appConfig.app.shopUrl], {
    detached: true,
    stdio: 'ignore',
  });

  browserProcess.unref();

  console.log('Shop page opened. If Chrome is already running, Windows should reuse that logged-in browser profile.');
}

main().catch((error) => {
  console.error('Failed to open Meesho:', error);
  process.exitCode = 1;
});