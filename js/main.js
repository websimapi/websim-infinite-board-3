import { Game } from './game.js';

window.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('touchmove', (e) => {
        if (e.target.tagName !== 'BUTTON') {
            e.preventDefault();
        }
    }, { passive: false });
    
    document.addEventListener('dblclick', (e) => e.preventDefault());

    const game = new Game();
});

