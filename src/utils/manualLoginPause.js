const readline = require('readline/promises');
const { stdin, stdout } = require('process');

// This helper pauses the flow without hardcoding any credentials, so you can finish login manually in the browser.
async function waitForManualLogin() {
  const prompt = readline.createInterface({
    input: stdin,
    output: stdout,
  });

  await prompt.question('\nLog in in the browser, then press Enter here to save the session and continue...');
  prompt.close();
}

module.exports = { waitForManualLogin };