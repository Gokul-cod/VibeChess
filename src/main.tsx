import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/outfit';
import './styles.css';
import App from './App';
import { initTheme } from './lib/theme';

initTheme();

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
