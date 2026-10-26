import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import { FamilyProvider } from './context/FamilyContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <FamilyProvider>
        <App />
      </FamilyProvider>
    </ThemeProvider>
  </StrictMode>,
);
