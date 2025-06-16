import {formatTime} from "/js/utils.js";
import {PhysicalNode} from "/js/plugins/physical-node.js";

/// The tree structure that is the physical plan. Merging the metadata
/// when need be.
export class PhysicalTree {

    parent; // The parent DOM
    container; // The DOM container of the tree
    id2dom; // integer_id -> dom 
    id2node; // integer_id -> node (service may have 2 init append calls for 1 id)
    
    constructor(parent) {
        this.parent = parent;
        this.reset();
    }

    reset() {
        this.container && this.container.remove();
        this.id2node = new Map();
    }

    resetDOM() {
        this.container && this.container.remove();
        this.container = document.createElement("ul"); // the plan is a big nested list
        this.container.style.paddingLeft = "0px";
        this.parent.appendChild(this.container);
        this.id2dom = new Map();
    }
    
    initialize(messages) {
        this.reset();
        this.resetDOM();
        const sorted = messages.sort((a, b) => a.date - b.date);
        sorted.forEach((message) => {this.update(message);}); // update includes render
        return true;
    }

    draw() {
        this.resetDOM();
        let sorted = [...this.id2node.entries()].sort((a, b) => a[0] - b[0]);
        sorted.forEach(([k, v]) => {
            this.renderNode(v);
        });
    }

    update(message) {
        switch (message.type) {
        case "MessagePhysicalPlanInit":
            const node = this.id2node.get(message.n) || new PhysicalNode(message.n, message.pn);
            node.update(message);
            // could already exist, it happens for service physical nodes that send 2 queries
            if (!this.id2node.has(node.id)) {
                this.id2node.set(node.id, node);
                const parent = this.id2node.get(message.pn);
                parent && parent.addChild(node); // crawlable both ways then
            };
            
            if (this.container && !this.id2dom.has(node.id)) {
                this.renderNode(node);
            }
            return;
        case "MessagePhysicalPlanAppend":
            const updatedNode = this.id2node.get(message.n).update(message); // should be enough to update
            this.updateNode(updatedNode);
            return;
        default: throw new Exception(`Tree update cannot handle:  ${JSON.stringify(message)}.`);
        };
    }


    // TODO make it more generic, with a visitor that understand the repetitions, i.e.
    //      if node n = node n+1, n+2 n+k (k being a parameter) then we can create little
    //      cute squares instead.
    // TODO use sparqlalgebrajs to check the node types.
    static isProjectWithOnlyServices(node) {
        if (!node || !node.children || !Array.isArray(node.children)) return false;
        if (node.lo !== "project" && node.lo !=="slice") return false;
        return node.children.every(child => {
            if (child.lo === "service") return true;
            
            if(["project","slice"].includes(child.lo) && child.children && child.children.length > 0){
                return PhysicalTree.isProjectWithOnlyServices(child);}
            
            return false;
        });
    }

    static isSubtreeOnlyServices(node) {
        // Si c'est un service, on accepte
        if (node.lo === "service") return true;

        // Si c'est un slice ou project ou autre avec des enfants
        if (node.children && node.children.length > 0) {
            return node.children.every(child => PhysicalTree.isSubtreeOnlyServices(child));
        }

        // Si c'est un nœud non-service sans enfants => rejeté
        return false;
    }

    renderNode(node) {
        if (!this.container) {return ;}
        const parentDom = this.id2dom.get(node.parent) || this.container;

        // TODO
        // if (PhysicalTree.isProjectWithOnlyServices(node)) { 
        //     return this.renderServiceSquares(node, parentElement);
        // }

        const li = document.createElement("li");
        li.classList.add("node");
        node.status() && li.classList.add(`physical-${node.status()}`);
        li.title = node.metadata();
        this.id2dom.set(node.id, li); // register the dom representing the node

        const timestampSpan = document.createElement("span");
        timestampSpan.classList.add("timestamp");
        timestampSpan.innerHTML = `[${formatTime(node.date())}]`;
        const contentSpan = document.createElement("span");
        contentSpan.classList.add("node-label");
        contentSpan.innerHTML = node.logical();
        const eventSpan = document.createElement("span");
        eventSpan.classList.add("event-inline");

        li.appendChild(timestampSpan);
        li.appendChild(contentSpan);
        li.appendChild(eventSpan);

        // create space for the children
        const ul = document.createElement("ul");
        ul.classList.add("children");
        li.appendChild(ul);

        parentDom.appendChild(li); // TODO get first ul

        // node.events.forEach((evt) => {
        //     const m = evt.m;
        //     const displayParts = [];
        //     if ("timeLife" in m) displayParts.push(`time: ${m.timeLife}`);
        //     if ("cardinalityReal" in m)
        //         displayParts.push(`cardinality: ${m.cardinalityReal}`);
        //     if ("startAt" in m) li.classList.add("executing");
        //     if ("doneAt" in m) li.classList.remove("executing");
            
        //     if (displayParts.length > 0) {
        //         eventSpan.textContent += "  " + displayParts.join(" ");
        //     }
        // });
        
        // node.children.forEach((child) => {
        //     this.renderNode(child);
        // });
    }

    updateNode(node) {
        if (!this.container) {return ;} // not updating the dom node
        const dom = this.id2dom.get(node.id);
        dom.title = node.metadata();
        dom.classList.replace("physical-pending", `physical-${node.status()}`);
    }

    renderServiceSquares(node, parentElement) {
        const li = document.createElement("li");
        li.style.listStyleType = "none";
        li.style.paddingLeft = "10px";
        li.classList.add("node");
        li.classList.add(node.status());
        this.node2dom.set(node, parentElement);
        const contentSpan = document.createElement("span");
        contentSpan.className = "node-label";
        contentSpan.innerHTML = `<span class="timestamp">[${formatTime(node.date)}]</span>  project (service group)`;

        const grid = document.createElement("div");
        grid.className = "service-grid";

        const flatServices = [];
        
        const self = this;
        function collectServices(n) {
            n.children.forEach(child => {
                if (child.lo === "service") {
                    flatServices.push(child);
                } else if (child.lo === "slice"  || child.lo === "project") {
                    self.node2dom.set(child, parentElement); // TODO remove this, do it cleaner
                    collectServices(child);

                }
            });
        }

        collectServices(node);

        li.appendChild(contentSpan);
        li.appendChild(grid);
        parentElement.appendChild(li);

        const baseTime =  Date.now(); // timeLine[0].timestamp; // TODO fix this

        flatServices.forEach(service => {
            this.node2dom.set(service, parentElement);
            const delay = service.timestamp - baseTime;

            const square = document.createElement("div");
            square.className = "service-square";
            
            square.title = `     
     Timestamp: ${new Date(service.date).toLocaleTimeString()}\n
     TimeLife: ${service?.m?.timeLife ?? "N/A"}\n
     Cardinality: ${service?.m?.cardinalityReal ?? "N/A"}\n
     Query: ${service?.m?.query ?? "N/A"}`;

            grid.appendChild(square);
            if (service?.m?.status === "error") {
                square.style.backgroundColor = "red";
                square.title = ` ${service?.m?.message}`;
            } else {
                square.style.backgroundColor = " #a3be8c";
            }

            // Force transition sur l'opacité
            requestAnimationFrame(() => {
                square.style.opacity = "1";
            });
            setTimeout(() => {
            }, delay);
        });
    }

    
}
