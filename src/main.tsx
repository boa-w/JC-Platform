import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppBoundary } from './components/RecoveryBoundary';
import { AppI18nProvider } from './i18n';
import { installRuntimeDiagnostics } from './lib/runtimeDiagnostics';

installRuntimeDiagnostics();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppI18nProvider>
      <AppBoundary>
        <App />
      </AppBoundary>
    </AppI18nProvider>
  </React.StrictMode>,
);
