import {LoggerPretty} from '@comunica/logger-pretty';

/// A plugin that draws the standard console output from
/// Comunica. Should only be text based, nothing too fancy.
export class ComunicaConsolePlugin {

    priority = 10;
    hideFromSelection = false;
    history = [];
    container = null;
    
    constructor(yasr) { this.yasr = yasr; }

    getLogger() {
        this.history = []; // reset
        this.container = null;
        const logger = new LoggerPretty({ level: 'info' });
        logger.log = (level, color, message, data) => {
            this.history.push(message);
            if (this.container) {
                this.container.innerHTML += message + '\n';
            };
        };
        return logger;
    }
    
    canHandleResults() { return this.history.length > 0; }

    draw() {
        this.container = document.createElement('pre');
        this.container.innerHTML = this.history.join('\n');
        this.yasr.resultsEl.appendChild(this.container);
    }
    
    getIcon() {
        const textIcon = document.createElement('div');
        // from <https://www.svgrepo.com/svg/363115/terminal-window-bold>
        // COLLECTION: Phosphor Bold Icons
        // LICENSE: MIT License
        // AUTHOR: phosphor
        textIcon.innerHTML = '<svg fill="#000000" viewBox="0 0 256 256" id="Flat" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M72.50391,150.62988,100.791,128,72.50391,105.37012A11.9996,11.9996,0,0,1,87.49609,86.62988l40,32a11.99895,11.99895,0,0,1,0,18.74024l-40,32a11.9996,11.9996,0,1,1-14.99218-18.74024ZM143.99414,172h32a12,12,0,1,0,0-24h-32a12,12,0,0,0,0,24ZM236,56.48535v143.0293A20.50824,20.50824,0,0,1,215.51465,220H40.48535A20.50824,20.50824,0,0,1,20,199.51465V56.48535A20.50824,20.50824,0,0,1,40.48535,36h175.0293A20.50824,20.50824,0,0,1,236,56.48535ZM212,60H44V196H212Z"></path> </g></svg>'
        return textIcon;
    }

}
