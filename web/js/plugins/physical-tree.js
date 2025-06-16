
/// The tree structure that is the physical plan. Merging the metadata
/// when need be.
export class PhysicalTree {

    parent; // The parent DOM
    container; // The DOM container of the tree
    rootNodes; // TODO possibly remove this
    nodeMap; // to ensure uniqueness easily
    node2dom;
    node2domChildren;
    
    constructor(parent) {
        this.parent = parent;
        this.reset();
    }

    reset() {
        this.container && this.container.remove();
        this.rootNodes = [];
        this.nodeMap = new Map();
        this.node2dom = new Map();
    }
    
    initialize(messages) {
        console.log("init");
        this.container = document.createElement("ul");
        this.parent.appendChild(this.container);
        
        const sorted = messages.sort((a, b) => a.date - b.date);
        sorted.forEach((message) => {this.update(message);}); // update includes render
        return true;
    }

    draw() {
        this.nodeMap.forEach((v, k) => {
            this.renderNode(v);
        });
    }

    update(message) {
        switch (message.type) {
        case "MessagePhysicalPlanInit":
            // TODO possibly get rid of entry.date as key builder element
            const uniqueKey = `${message.n}-${message.date}`;
            const node = {
                ...message,
                children: [],
                events: [],
                m: { ...(message.m || {}) },
            };

            this.nodeMap.set(uniqueKey, node);

            const parentNode = [...this.nodeMap.values()].find((n) => n.n === message.pn);
            if (parentNode) {
                parentNode.children.push(node);
                node.parent = parentNode;
            } else {
                this.rootNodes.push(node);
            }
            
            return node; // return the new node properly set.
        case "MessagePhysicalPlanAppend":
            // TODO possibly change this since nodeMap may change
            const targetNode = [...this.nodeMap.values()]
                .reverse()
                .find((n) => n.n === message.n);
            
            if (targetNode) {
                targetNode.events.push(message);
                
                if (message.m) {
                    targetNode.m = {
                        ...targetNode.m,
                        ...message.m,
                    };
                }
            } else {
                throw new Exception(`Tree ask for update node while its initialization is not performed: ${message.n}.`);
            }
            return targetNode; // return the node that previously existed.
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
        if (this.node2dom.get(node)) {return ;} // already rendered
        const parentElement = (!node.parent && this.container) || this.node2dom.get(node.parent);
        if (PhysicalTree.isProjectWithOnlyServices(node)) {
            return this.renderServiceSquares(node, parentElement);
        }

        const li = document.createElement("li");
        // li.style.listStyleType = "none";
        li.classList.add("node");
        li.setAttribute("data-node-id", node.n); // TODO, why not use .id

        const contentSpan = document.createElement("span");
        contentSpan.className = "node-label";
        // TODO createElement instead of innerHTML
        contentSpan.innerHTML = `<span class="timestamp">[${new Date(
    node.date
  ).toLocaleTimeString()}]</span>  ${node.lo}`;

        const eventSpan = document.createElement("span");
        eventSpan.className = "event-inline";
        eventSpan.style.marginLeft = "10px";

        li.appendChild(contentSpan);
        li.appendChild(eventSpan);

        const ul = document.createElement("ul");
        ul.style.display = "block"; // TODO all style should be in stylesheet
        li.appendChild(ul);
        parentElement.appendChild(li);
        this.node2dom.set(node, ul);

        node.events.forEach((evt) => {
            const m = evt.m;
            const displayParts = [];
            if ("timeLife" in m) displayParts.push(`time: ${m.timeLife}`);
            if ("cardinalityReal" in m)
                displayParts.push(`cardinality: ${m.cardinalityReal}`);
            if ("startAt" in m) li.classList.add("executing");
            if ("doneAt" in m) li.classList.remove("executing");
            
            if (displayParts.length > 0) {
                eventSpan.textContent += "  " + displayParts.join(" ");
            }
        });
        
        node.children.forEach((child) => {
            this.renderNode(child);
        });
    }


    renderServiceSquares(node, parentElement) {
        const li = document.createElement("li");
        li.style.listStyleType = "none";
        li.style.paddingLeft = "40px";
        li.classList.add("node");
        this.node2dom.set(node, parentElement);
        const contentSpan = document.createElement("span");
        contentSpan.className = "node-label";
        contentSpan.innerHTML = `<span class="timestamp">[${new Date(
    node.date
  ).toLocaleTimeString()}]</span>  project (service group)`;

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
        console.log(node, parentElement);
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
