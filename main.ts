import path from 'node:path';
import { app, BrowserWindow, globalShortcut } from 'electron';

/** O Electron é um kiosk em cima da aplicação publicada. */
const APP_URL = 'https://sistemadesenha-1w3x.vercel.app/login';

let win: BrowserWindow | null = null;

function createWindow(): void {
  // `app.getAppPath()` aponta para a raiz do app (onde está o package.json),
  // não para a pasta do bundle — o ícone é lido de lá tanto em dev quanto
  // dentro do asar empacotado.
  const browserWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Sistema de Atendimento',
    autoHideMenuBar: true,
    icon: path.join(app.getAppPath(), 'src', 'app', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false, // Impede a suspensão do app ao minimizar
    },
  });
  win = browserWindow;

  void browserWindow.loadURL(APP_URL);

  browserWindow.webContents.on('did-finish-load', () => {
    browserWindow.webContents.setAudioMuted(false);
  });
}

/**
 * Atalhos globais: funcionam mesmo com a janela em segundo plano/minimizada.
 * Cada tecla dispara o `KeyboardEvent` correspondente dentro da página.
 */
function registerGlobalShortcuts(): void {
  const shortcuts: ReadonlyArray<{
    readonly keys: readonly string[];
    readonly triggerKey: string;
  }> = [
    { keys: ['Right'], triggerKey: 'ArrowRight' }, // Próxima normal
    { keys: ['Left'], triggerKey: 'ArrowLeft' }, // Preferencial
    { keys: ['Up'], triggerKey: 'ArrowUp' }, // Repetir
  ];

  for (const { keys, triggerKey } of shortcuts) {
    for (const key of keys) {
      try {
        globalShortcut.register(key, () => {
          if (win && !win.isDestroyed()) {
            void win.webContents.executeJavaScript(`
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new KeyboardEvent('keydown', { key: '${triggerKey}', bubbles: true }));
              }
            `);
          }
        });
      } catch {
        // Ignora caso o atalho esteja em uso por outro aplicativo do sistema
      }
    }
  }
}

void app.whenReady().then(() => {
  createWindow();
  registerGlobalShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
