import {MemoryPhysicalQueryPlanLogger} from '@comunica/actor-query-process-explain-physical';

/// Displays the physical plan created by comunica, that
/// dynamically gets updated over query execution.
export class PhysicalPlanPlugin {

    priority = 10;
    hideFromSelection = false;
    history = [];
    container = null;
    
    constructor(yasr) { this.yasr = yasr; }

    download(filename) {
        filename = (filename !== 'Query' && filename) || 'physicalPlan';
        return {
            getData: () => JSON.stringify(this.history) || "",
            contentType: 'json',
            title: 'Download physical plan',
            filename: `${filename}.json`,
        };
    }

    reset() {
        this.container = null;
        this.history = [];
    }
    
    append(entry) {
        this.history.push(entry);
        if (this.container) {
            this.container.textContent += JSON.stringify(entry) + "\n"; // TODO proper update function
        };
    }

    canHandleResults() { return this.history.length > 0; }

    draw () {
        this.container = document.createElement('pre');
        this.container.textContent = this.history.map(e => JSON.stringify(e)).join('\n');
        this.yasr.resultsEl.appendChild(this.container);
    }

    getIcon() {
        const textIcon = document.createElement("div");
        textIcon.setAttribute("class", "svgImg plugin_icon");
        // happy little tree
        // taken from https://www.svgrepo.com/svg/363159/tree-evergreen-bold
        // COLLECTION: Phosphor Bold Icons
        // LICENSE: MIT License
        // AUTHOR = phosphor
        textIcon.innerHTML = '<svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg"><g><path d="M233.47217,184.63281,192.53564,132H208a12.0002,12.0002,0,0,0,9.51172-19.31641l-80-104a12.00029,12.00029,0,0,0-19.02344,0l-80,104A12.0002,12.0002,0,0,0,48,132H63.46436L22.52783,184.63281A11.99982,11.99982,0,0,0,32,204h84v36a12,12,0,0,0,24,0V204h84a11.99982,11.99982,0,0,0,9.47217-19.36719ZM56.53564,180l40.93653-52.63281A11.99982,11.99982,0,0,0,88,108H72.37012L128,35.68164,183.62988,108H168a11.99982,11.99982,0,0,0-9.47217,19.36719L199.46436,180Z"></path></g></svg>'
        return textIcon;
    }
    
}
