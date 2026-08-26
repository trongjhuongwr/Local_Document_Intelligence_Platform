import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeLanguageProvider } from './context/ThemeLanguageContext';
import './index.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ThemeLanguageProvider>
        <App />
      </ThemeLanguageProvider>
    </React.StrictMode>
  );
}
