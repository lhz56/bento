// Windows: what differs there when Bento helps you set up an AI. The catalog's "win" entries replace the Mac's commands
// (PowerShell, winget and npm instead of curl | bash and Homebrew), and a command opens in a new PowerShell window,
// where you see exactly what runs, the way the Mac opens Terminal. Only commands from ai-catalog.json ever get here.
'use strict';
const forPlatform = (c, platform = process.platform) =>
  c && platform === 'win32' && c.win ? { ...c, ...c.win } : c;
// a PowerShell string in single quotes: a quote inside is doubled, nothing else is special
const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;
// powershell.exe -Command "Start-Process powershell.exe -ArgumentList '-NoExit -Command <cmd>'": a new window that stays open
function powershellWindow(cmd) {
  if (typeof cmd !== 'string' || !cmd.trim() || /[\r\n]/.test(cmd))
    throw new Error('No command to run.');
  return [
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Start-Process powershell.exe -ArgumentList ${psQuote(`-NoExit -Command ${cmd}`)}`,
    ],
  ];
}
module.exports = { forPlatform, psQuote, powershellWindow };
