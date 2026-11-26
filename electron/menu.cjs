// The menu bar. Bento's own commands (Settings, New question, Search, the sidebar, shortcuts) are sent to the page,
// which owns them; the rest are the standard macOS items. No Electron links, and no Reload or DevTools outside
// development (⌘R mid-lesson would throw away a lesson that's still being written).
const { app, Menu, shell, dialog } = require('electron');
const os = require('node:os');

const REPO = 'https://github.com/lhz56/bento'; // the source and its issues (downloads and release notes live in lhz56/bento-releases)

function build({ dev, send, checkForUpdates, logsDir }) {
  const mac = process.platform === 'darwin';
  const name = app.getName();
  const act = (action) => () => send(action);
  const reportUrl = () => {
    const body = `What happened:\n\n\nWhat you expected:\n\n\n---\nBento ${app.getVersion()} · ${mac ? 'macOS' : process.platform} ${os.release()} · ${process.arch}`;
    return `${REPO}/issues/new?body=${encodeURIComponent(body)}`;
  };
  const template = [
    ...(mac
      ? [
          {
            label: name,
            submenu: [
              { role: 'about', label: `About ${name}` },
              { label: 'Check for Updates…', click: () => checkForUpdates() },
              { type: 'separator' },
              { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: act('settings') },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide', label: `Hide ${name}` },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit', label: `Quit ${name}` },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Question', accelerator: 'CmdOrCtrl+N', click: act('new') },
        { label: 'Open a Folder…', click: act('openFolder') },
        { type: 'separator' },
        ...(mac
          ? [{ role: 'close', label: 'Close Window' }]
          : [
              { label: 'Settings…', accelerator: 'Ctrl+,', click: act('settings') },
              { type: 'separator' },
              { role: 'quit' },
            ]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: act('find') },
        ...(mac
          ? [
              { type: 'separator' },
              { label: 'Speech', submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }] },
            ]
          : []),
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Search Everything', accelerator: 'CmdOrCtrl+K', click: act('search') },
        { label: 'Show or Hide the Sidebar', accelerator: 'CmdOrCtrl+\\', click: act('sidebar') },
        { type: 'separator' },
        { label: 'Back', accelerator: 'CmdOrCtrl+[', click: act('back') },
        { label: 'Forward', accelerator: 'CmdOrCtrl+]', click: act('forward') },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(dev
          ? [
              { type: 'separator' },
              { role: 'reload' },
              { role: 'forceReload' },
              { role: 'toggleDevTools' },
            ]
          : []),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Keyboard Shortcuts', accelerator: 'CmdOrCtrl+/', click: act('keys') },
        { label: 'Connections & Setup', click: act('setup') },
        { type: 'separator' },
        { label: 'Bento on GitHub', click: () => shell.openExternal(REPO) },
        { label: 'Report a Problem…', click: () => shell.openExternal(reportUrl()) },
        { label: 'Show Logs', click: () => shell.openPath(logsDir) },
        ...(!mac
          ? [{ type: 'separator' }, { label: 'Check for Updates…', click: () => checkForUpdates() }]
          : []),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// "Check for Updates…": say plainly what happened, in a small native sheet
async function explainUpdates(updater, win) {
  const before = updater.getState();
  if (before.status === 'off') {
    return dialog.showMessageBox(win, {
      type: 'info',
      message: 'Updates aren’t available in this copy',
      detail: `Bento ${app.getVersion()}: ${before.reason}. Copies downloaded from GitHub Releases update themselves.`,
      buttons: ['OK'],
    });
  }
  if (before.status === 'ready') return updater.install();
  await updater.check();
  const st = updater.getState();
  const msg =
    st.status === 'downloading'
      ? [
          `Bento ${st.version || ''} is downloading`,
          'It installs the next time you quit Bento, or press Restart in the sidebar when it’s ready.',
        ]
      : st.status === 'ready'
        ? [
            `Bento ${st.version || ''} is ready`,
            'Restart Bento to finish updating. Your lessons are saved.',
          ]
        : st.status === 'error'
          ? ['Couldn’t check for updates', st.reason || 'Try again later.']
          : ['You’re up to date', `Bento ${app.getVersion()} is the newest version.`];
  return dialog.showMessageBox(win, {
    type: 'info',
    message: msg[0],
    detail: msg[1],
    buttons: ['OK'],
  });
}

module.exports = { build, explainUpdates, REPO };
