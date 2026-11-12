import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createBridge, figmaTransport } from './bridge';
import { NotesProvider } from './NotesProvider';
import './styles.css';

// One bridge per window load: its runId tells this window's answers apart.
const bridge = createBridge(figmaTransport());

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <NotesProvider bridge={bridge}>
        <App />
      </NotesProvider>
    </StrictMode>,
  );
}
