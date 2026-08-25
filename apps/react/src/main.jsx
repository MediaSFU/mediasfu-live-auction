import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { installLocalValidationMedia } from './validationMedia.js';
import './styles.css';
import './parity.css';
import './inviteLink.css';
installLocalValidationMedia(location.search);
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
