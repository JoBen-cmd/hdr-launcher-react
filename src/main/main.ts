/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import * as fs from 'fs';
import * as os from 'os';
import { Responses } from 'nx-request-api';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import Config from './config';
import { RequestHandler } from './request_handler';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify().catch((e) => console.error(e));
  }
}

export let mainWindow: BrowserWindow | null = null;

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1300,
    height: 700,
    resizable: true,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(async () => {
    createWindow()
      .then(findEmulator)
      .then(findRom)
      .then(findSdcard)
      .then(registerListeners)
      .then(() => {
        // create the sdcard folder if its not there
        if (!fs.existsSync(Config.getSdcardPath())) {
          fs.mkdirSync(Config.getSdcardPath());
        }
      });

    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);

async function findEmulator() {
  if (mainWindow == null) {
    console.error('Browserwindow was not defined!');
    dialog.showErrorBox(
      'Invalid window context!',
      'Browser window was not defined! The application will now close'
    );
    app.exit(0);
    return;
  }
  while (Config.getRyuPath() == null || Config.getRyuPath() == '') {
    // show instructions to the user
    const response = dialog.showMessageBoxSync(mainWindow, {
      title: 'Instructions',
      message: 'Please select your Ryujinx executable.',
      buttons: ['ok', 'cancel'],
    });

    if (response != 0) {
      app.exit(0);
      return;
    }

    let selectedPath;
    if (os.platform() == 'win32') {
      // let the user point us to ryujinx on windows
      selectedPath = dialog.showOpenDialogSync(mainWindow, {
        title: 'Please select your Ryujinx executable',
        properties: ['openFile'],
        filters: [{ name: 'Ryujinx Executables', extensions: ['exe'] }],
      });
    } else {
      // let the user point us to ryujinx on linux
      selectedPath = dialog.showOpenDialogSync(mainWindow, {
        title: 'Please select your Ryujinx executable',
        properties: ['openFile'],
      });
    }
    if (!selectedPath || selectedPath.length < 1) {
      console.warn('User cancelled finding ryujinx!');
      app.exit(0);
      continue;
    }
    const ryuPath = selectedPath[0];

    // ensure that the path exists
    if (fs.existsSync(ryuPath)) {
      console.log('given path exists');
    } else {
      dialog.showErrorBox('Invalid path!', 'The given path does not exist!');
      continue;
    }

    const fileName = path.basename(ryuPath);
    console.log(`filename: ${fileName}`);
    if (fileName.includes('Ryujinx')) {
      console.log(`setting ryu path: ${ryuPath}`);
      Config.setRyuPath(ryuPath);
    } else {
      dialog.showErrorBox(
        'Invalid path!',
        'The given file is not a Ryujinx executable!'
      );
    }
  }
}

async function findRom() {
  if (mainWindow == null) {
    console.error('Browserwindow was not defined!');
    dialog.showErrorBox(
      'Invalid window context!',
      'Browser window was not defined! The application will now close'
    );
    app.exit(0);
    return;
  }

  while (Config.getRomPath() == null || Config.getRomPath() == '') {
    // show instructions to the user
    const response = dialog.showMessageBoxSync(mainWindow, {
      title: 'Instructions',
      message: 'Please select your valid Smash Ultimate 13.0.1 dump.',
      buttons: ['ok', 'cancel'],
    });

    if (response != 0) {
      app.exit(0);
      return;
    }

    // let the user point us to the rom
    const selectedPath = dialog.showOpenDialogSync(mainWindow, {
      title: 'Please select your valid Smash Ultimate dump.',
      properties: ['openFile'],
      filters: [{ name: 'Switch Roms', extensions: ['nsp', 'xci'] }],
    });
    if (!selectedPath || selectedPath.length < 1) {
      console.warn('User cancelled finding ultimate dump!');
      app.exit(0);
      continue;
    }
    const romPath = selectedPath[0];

    // ensure that the path exists
    if (fs.existsSync(romPath)) {
      console.log('given path exists');
    } else {
      dialog.showErrorBox('Invalid path!', 'The given path does not exist!');
      continue;
    }
    console.log('setting rom path.');
    Config.setRomPath(romPath);
  }
}

async function findSdcard() {
  if (Config.getSdcardPath() != null && Config.getSdcardPath() != '') {
    return;
  }

  if (mainWindow == null) {
    console.error('Browserwindow was not defined!');
    dialog.showErrorBox(
      'Invalid window context!',
      'Browser window was not defined! The application will now close'
    );
    app.exit(0);
    return;
  }

  let configDir = '';
  if (process.platform == 'win32') {
    configDir = `${process.env.APPDATA}/Ryujinx`;
  } else if (process.platform == 'darwin') {
    const selectedPath = dialog.showOpenDialogSync(mainWindow, {
      title: 'Please select your Ryujinx config directory',
      properties: ['openDirectory'],
    });
    if (selectedPath === undefined) {
      dialog.showErrorBox(
        'Error!',
        'Ryujinx config directory is required for the HDR launcher to function. We will now close.'
      );
      app.quit();
      return;
    }
    configDir = path.join(selectedPath[0], '/');
  } else {
    configDir = path.join(os.homedir(), '.config/Ryujinx/');
  }

  if (!fs.existsSync(configDir)) {
    // expected config dir was not found! Check for portable mode...
    const isPortable = dialog.showMessageBoxSync(mainWindow, {
      title: 'Portable Mode?',
      message: 'Is this Ryujinx installation in portable mode?',
      buttons: ['Yes', 'No'],
    });
    if (isPortable === 0) {
      console.info('asking for sdcard folder from portable installation.');
      const selectedDir = dialog.showOpenDialogSync(mainWindow, {
        title: 'Please select your Ryujinx config directory',
        properties: ['openDirectory'],
      });
      if (selectedDir) {
        console.info(`Selected config directory: ${selectedDir}`);
        configDir = selectedDir[0];
      } else {
        console.error('User cancelled sdcard selection!');
      }
    }
  }

  if (fs.existsSync(configDir)) {
    console.info(`setting sdcard root to ${path.join(configDir, 'sdcard')}`);
    Config.setSdcardPath(path.join(configDir, 'sdcard/'));
    // create the sdcard folder if its not there
    if (!fs.existsSync(Config.getSdcardPath())) {
      fs.mkdirSync(Config.getSdcardPath());
    }
  } else {
    console.error(`Ryujinx directory not found at ${configDir}!`);
    dialog.showErrorBox(
      'Ryujinx not found!',
      `Ryujinx directory not found at ${configDir}!`
    );
    Config.setSdcardPath('');
    app.quit();
  }
}

async function registerListeners() {
  const requestHandler = new RequestHandler();

  // register listening to the request channel
  ipcMain.handle('request', (event, request): Promise<Responses.OkOrError> => {
    // console.log("main thread received request: " + JSON.stringify(request));
    return requestHandler.handle(request);
  });
}
