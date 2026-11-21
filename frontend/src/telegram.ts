const TELEGRAM_SDK_URL = 'https://telegram.org/js/telegram-web-app.js?65';

type TelegramWindow = Window & {
  Telegram?: { WebApp?: { ready(): void; expand(): void } };
  TelegramWebviewProxy?: object;
};

export function prepareTelegramLayout(): () => void {
  const host = window as TelegramWindow;
  const launch = new URLSearchParams(host.location.hash.slice(1));
  if (!host.TelegramWebviewProxy && !launch.has('tgWebAppPlatform') && !launch.has('tgWebAppData')) {
    return () => {};
  }

  document.documentElement.classList.add('telegram-mini-app');
  const sdk = document.createElement('script');
  sdk.src = TELEGRAM_SDK_URL;
  const loaded = host.Telegram?.WebApp
    ? Promise.resolve()
    : new Promise<void>(resolve => {
      sdk.addEventListener('load', () => resolve(), { once: true });
      sdk.addEventListener('error', () => resolve(), { once: true });
      document.head.append(sdk);
    });

  return () => {
    void loaded.then(() => {
      const webApp = host.Telegram?.WebApp;
      webApp?.ready();
      webApp?.expand();
    });
  };
}
