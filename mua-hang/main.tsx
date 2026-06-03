import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import MuaHangApp from './MuaHangApp';
import '../index.css';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <MuaHangApp />
    </StrictMode>,
);
