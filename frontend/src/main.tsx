import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/global.css';
import { App } from './components/App';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { I18nProvider } from './i18n';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <I18nProvider>
            <App />
          </I18nProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);

// O service worker só existe no build de produção: em dev ele cachearia o
// shell antigo e atrapalharia o HMR.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    let applying = false;
    let reloaded = false;

    // O SW novo fica em "waiting" até o usuário aceitar (ver UpdateToast):
    // recarregar no meio de uma edição perderia o que está na tela.
    window.addEventListener('pwa:apply-update', async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.waiting) {
        window.location.reload();
        return;
      }
      applying = true;
      registration.waiting.postMessage('SKIP_WAITING');
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!applying || reloaded) return;
      reloaded = true;
      window.location.reload();
    });

    const announceUpdate = (registration: ServiceWorkerRegistration) => {
      // controller == null means this is the very first install, not an update.
      if (registration.waiting && navigator.serviceWorker.controller) {
        window.dispatchEvent(new Event('pwa:update-ready'));
      }
    };

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        announceUpdate(registration);

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new Event('pwa:update-ready'));
            }
          });
        });
      })
      .catch((err) => console.warn('Service worker registration failed:', err));
  });
}
