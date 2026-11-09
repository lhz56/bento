import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

if (!window.bento) document.body.classList.add('browser');
// hold ⌥ to reveal draggable numbers
addEventListener('keydown', (e) => { if (e.key === 'Alt') document.body.classList.add('alt'); });
addEventListener('keyup', (e) => { if (e.key === 'Alt') document.body.classList.remove('alt'); });
addEventListener('blur', () => document.body.classList.remove('alt'));

createRoot(document.getElementById('root')).render(<App />);
