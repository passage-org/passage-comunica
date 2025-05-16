import {LoggerPretty} from '@comunica/logger-pretty';

/// A plugin that draws the standard console output from
/// Comunica. Should only be text based, nothing too fancy.
/// oooor, a table that can be sorted by time, or log level.
export class ComunicaConsolePlugin {

    priority = 10;
    hideFromSelection = false;
    history = [];
    container = null;
    tbody = null; // the body of the table displaying rows of log
    
    constructor(yasr) { this.yasr = yasr; }

    /// make sure to reset the data and view
    /// so it does not impair performance forever.
    resetDOM() {
        this.tbody && this.tbody.remove();
        this.tbody = null;
        this.container && this.container.remove();
        this.container = null;
    }
    
    getLogger() {
        this.resetDOM();
        this.history = []; // reset history
        const id = ++this.currentId;
        const logger = new LoggerPretty({ level: 'info' });
        logger.log = (level, color, message, data) => {
            const entry = {level: level, message: message, date:Date.now()};
            this.history.push(entry);
            this.concatNewRow(entry);
        };
        return logger;
    }
    
    canHandleResults() { return this.history.length > 0; }
    
    draw() {
        this.resetDOM();
        this.container = document.createElement('div');
        this.container.classList.add('dataTables_wrapper');
        const table = document.createElement('table');
        table.classList.add('dataTable');
        const headers = document.createElement('thead');
        const row = document.createElement('tr');
        const dateHeader = document.createElement('th');
        dateHeader.innerHTML = 'timestamp';
        row.append(dateHeader);
        const levelHeader = document.createElement('th');
        levelHeader.innerHTML = 'level';
        row.append(levelHeader);
        const messageHeader = document.createElement('th');
        messageHeader.innerHTML = 'message';
        row.append(messageHeader);
        headers.append(row);
        table.append(headers);
        this.container.append(table);
        this.tbody = document.createElement('tbody');
        table.append(this.tbody);
        
        this.history.forEach(entry => {
            this.concatNewRow(entry);
        });
        
        this.yasr.resultsEl.append(this.container);
    }

    /// Concatenate a new row of data to the table
    concatNewRow(entry) {
        if (this.container) {
            // append a new line to the table
            const row = document.createElement('tr');
            const dateContainer = document.createElement('td');
            const hoursOnly = new Date(entry.date).toLocaleString().split(' ')[1];
            const millisOnly = new Date(entry.date).getMilliseconds();
            dateContainer.innerHTML = hoursOnly+"."+String(millisOnly).padStart(3, '0');
            const levelContainer = document.createElement('td');
            levelContainer.innerHTML = entry.level;
            levelContainer.classList.add(entry.level);
            const messageContainer = document.createElement('td');
            const messageFormat = document.createElement('pre');
            messageFormat.textContent = entry.message;
            messageContainer.append(messageFormat);
            row.append(dateContainer);
            row.append(levelContainer);
            row.append(messageContainer);
            this.tbody.prepend(row);
        };
    }
    
    getIcon() {
        const textIcon = document.createElement('div');
        // from <https://www.svgrepo.com/svg/363115/terminal-window-bold>
        // COLLECTION: Phosphor Bold Icons
        // LICENSE: MIT License
        // AUTHOR: phosphor
        textIcon.innerHTML = '<svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg"><g> <path d="M72.50391,150.62988,100.791,128,72.50391,105.37012A11.9996,11.9996,0,0,1,87.49609,86.62988l40,32a11.99895,11.99895,0,0,1,0,18.74024l-40,32a11.9996,11.9996,0,1,1-14.99218-18.74024ZM143.99414,172h32a12,12,0,1,0,0-24h-32a12,12,0,0,0,0,24ZM236,56.48535v143.0293A20.50824,20.50824,0,0,1,215.51465,220H40.48535A20.50824,20.50824,0,0,1,20,199.51465V56.48535A20.50824,20.50824,0,0,1,40.48535,36h175.0293A20.50824,20.50824,0,0,1,236,56.48535ZM212,60H44V196H212Z"></path></g></svg>'
        return textIcon;
    }

}
