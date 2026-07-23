const { appConfig } = require('./src/config/appConfig');
const { spawn } = require('child_process');

async function main() {
  console.log('Opening Meesho in the default browser...');

  const browserProcess = spawn('cmd', ['/c', 'start', '', appConfig.app.shopUrl], {
    detached: true,
    stdio: 'ignore',
  });

  browserProcess.unref();

  console.log('Meesho opened. Windows will reuse your existing logged-in browser if it is already running.');
}

main().catch((error) => {
  console.error('Failed to open Meesho:', error);
  process.exitCode = 1;
});