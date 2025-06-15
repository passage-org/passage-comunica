import {MemoryPhysicalQueryPlanLogger} from "@comunica/actor-query-process-explain-physical";
import {Tree} from "/js/plugins/build-tree.js";
import {TimeSlider} from "/js/plugins/time-slider.js";
import {
    renderTreeWithTimeouts,
    timeLine,
    replayStateAt,
    // updateNodeMetadata,
    // addNodeToTree,
} from "/js/plugins/render-tree.js";

/// Displays the physical plan created by comunica, that
/// dynamically gets updated over query execution.
export class PhysicalPlanPlugin {
    
    priority = 10;
    hideFromSelection = false;
    history = [];
    
    constructor(yasr) {
        this.yasr = yasr;
        this.slider = new TimeSlider(this.yasr.resultsEl);
        this.tree = new Tree(this.yasr.resultsEl); 
    }

    download(filename) {
        filename = (filename !== "Query" && filename) || "physicalPlan";
        return {
            getData: () => JSON.stringify(this.history) || "",
            contentType: "json",
            title: "Download physical plan",
            filename: `${filename}.json`,
        };
    }

    reset() {
        this.history = [];
        this.slider.reset(); // TODO
        this.tree.reset(); // TODO
    }
    
    append(entry) {
        this.history.push(entry);
        this.slider.update(entry); // TODO
        this.tree.update(entry); // TODO
    }

    updateTreeDisplay() {
        // const parsedHistory = this.getParsedHistory();
        // TODO parsedHistory from
        if (!parsedHistory.length) return;

        // const alreadyKnown = new Set(timeLine.map(e => e.timestamp));
        const alreadyKnown = new Set(this.history.map(h => h.split(":")[0]));

        const newEvents = parsedHistory.filter(e => !alreadyKnown.has(e.timestamp));

        if (!newEvents.length) return;

        for (const event of newEvents) {
            this.tree.updateBuildTree(event);
            timeLine.push(event);
        }

        if (!this.container) {
            this.container = document.createElement("div");
            this.container.id = "physical-plan-container";
            this.yasr.resultsEl.appendChild(this.container);
        } else {
            this.container.innerHTML = ""; // nettoie le contenu précédent
        }

        if (!document.body.contains(this.container)) return;

        if (!this.timeSlider) {
            this.timeSlider = new TimeSlider((percent) => {
                const elapsed = performance.now() - Math.max(0, this.minTime);
                const currentTime = Math.min(
                    minTime + ((maxTime - minTime) * percent) / 100,
                    minTime + elapsed
                );
                replayStateAt(currentTime);
            });

            this.timeSlider.mount(this.yasr.resultsEl);
        }

        renderTreeWithTimeouts(this.tree.rootNodes, this.container, this.timeSlider);
    }

    
    canHandleResults() {
        return this.history && this.history.length > 0;
    }

    draw() {
        this.container = document.createElement("div");
        this.container.id = "physical-plan-container";
        this.yasr.resultsEl.appendChild(this.container);

        const parsedHistory = this.getParsedHistory();
        const flatData = transformData(parsedHistory); // transformData has been removed
        const treeData = this.tree.buildTree(flatData);

        timeLine.length = 0;
        timeLine.push(...flatData);

        const timeSlider = new TimeSlider();

        timeSlider.mount(this.yasr.resultsEl);

        renderTreeWithTimeouts(treeData, this.container, timeSlider);
    }

    getIcon() {
        const textIcon = document.createElement("div");
        textIcon.setAttribute("class", "svgImg plugin_icon");
        // happy little tree
        // taken from https://www.svgrepo.com/svg/363159/tree-evergreen-bold
        // COLLECTION: Phosphor Bold Icons
        // LICENSE: MIT License
        // AUTHOR = phosphor
        textIcon.innerHTML =
            '<svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg"><g><path d="M233.47217,184.63281,192.53564,132H208a12.0002,12.0002,0,0,0,9.51172-19.31641l-80-104a12.00029,12.00029,0,0,0-19.02344,0l-80,104A12.0002,12.0002,0,0,0,48,132H63.46436L22.52783,184.63281A11.99982,11.99982,0,0,0,32,204h84v36a12,12,0,0,0,24,0V204h84a11.99982,11.99982,0,0,0,9.47217-19.36719ZM56.53564,180l40.93653-52.63281A11.99982,11.99982,0,0,0,88,108H72.37012L128,35.68164,183.62988,108H168a11.99982,11.99982,0,0,0-9.47217,19.36719L199.46436,180Z"></path></g></svg>';
        return textIcon;
    }
}
