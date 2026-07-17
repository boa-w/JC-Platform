import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppBoundary } from './components/RecoveryBoundary';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppBoundary>
      <App />
    </AppBoundary>
  </React.StrictMode>,
);
