import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import FrontiereErreur from './components/FrontiereErreur.jsx';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FrontiereErreur>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </FrontiereErreur>
  </React.StrictMode>
);
