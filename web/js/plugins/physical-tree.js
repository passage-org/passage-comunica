import {formatTime} from "/js/utils.js";
import {PhysicalNode} from "/js/plugins/physical-node.js";

/// The tree structure that is the physical plan. Merging the metadata
/// when need be.
export class PhysicalTree {

    parent; // The parent DOM
    container; // The DOM container of the tree
    id2dom; // integer_id -> dom 
    id2node; // integer_id -> node (service may have 2 init append calls for 1 id)

    maxWidth = 10; // the max width of the service, start at a default 10px
    
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
        this.container.classList.add("physical-plan-container");
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
            const node = this.id2node.get(message.n) || new PhysicalNode(message.n, this.id2node.get(message.pn));
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

        if (node.logical === "service") {
            // ugly complexity, but for now, it will do.
            let exploringNode = node;
            let countServices = null;
            while (exploringNode.parent && exploringNode.parent.children.filter(c=>c.logical==="service").length > 0) {
                countServices = exploringNode.parent.countServices(countServices);
                if (countServices > 1 && this.id2dom.has(exploringNode.parent.id)) {
                    const parentDom = this.id2dom.get(exploringNode.parent.id);
                    parentDom.title = `${exploringNode.parent.metadata()}\n\nNumber of sub-services: ${countServices}`;
                    // const inlineField = parentDom.getElementsByClassName("event-inline")[0];
                    // inlineField.innerHTML = `x${countServices} services`;
                }
                exploringNode = exploringNode.parent;
            }
        }
        
        const renderNormal = node.logical !== "service" || node.parent.getOriginalService(node) === node;

        if (renderNormal) {
            const li = document.createElement("li");
            li.classList.add("node");
            node.status() && li.classList.add(`physical-${node.status()}`);
            li.title = node.metadata();
            this.id2dom.set(node.id, li); // register the dom representing the node
        }
        
        node.logical === "service" && this.renderCompactService(node)
        if (!renderNormal) { return ; }

        const li = this.id2dom.get(node.id);

        const timestampSpan = document.createElement("span");
        timestampSpan.classList.add("timestamp");
        timestampSpan.innerHTML = `[${formatTime(node.date())}]`;
        const contentSpan = document.createElement("span");
        contentSpan.classList.add("node-label");
        contentSpan.innerHTML = node.logical;

        
        li.prepend(contentSpan);
        // li.prepend(timestampSpan);

        

        // create space for the children
        const ul = document.createElement("ul");
        ul.classList.add("children");
        li.appendChild(ul);

        const buttonFoldUnfold = document.createElement("button");
        li.prepend(buttonFoldUnfold);
        
        const foldUnfold = () => {
            if (buttonFoldUnfold.innerHTML === "+") {
                this.fold(node);
            } else if (buttonFoldUnfold.innerHTML === "-") {
                this.unfold(node);
            }
        }
        
        // TODO, on update if it has more than one child
        buttonFoldUnfold.classList.add("fold-unfold");
        if (node.logical !== "service") { // should be children > 0
            buttonFoldUnfold.innerHTML = "+";
        }
        timestampSpan.onclick = foldUnfold;
        buttonFoldUnfold.onclick = foldUnfold;
        contentSpan.onclick = foldUnfold;
        if (!node.unfold) {this.fold(node);}

        if (node.logical === "service") {
            !node.parent.unfold && this.fold(node.parent);
        }

        const parentDom = this.id2dom.get(node.parent && node.parent.id) || this.container;
        const parentChildrenDom = parentDom.getElementsByClassName("children")[0] || this.container;
        parentChildrenDom.appendChild(li);
    }


    renderCompactService(node) {
        if (node.logical === "service") {
            const original = node.parent.getOriginalService(node);
            
            if (original === node) {
                // TODO could be put in render normal
                const li = this.id2dom.get(node.id);
                const eventSpan = document.createElement("div");
                eventSpan.classList.add("event-inline");
                li.appendChild(eventSpan);
            } else {
                const parentDom = this.id2dom.get(node.parent.id);
                parentDom.remove();

            }
            
            const originalService = this.id2dom.get(original.id);
            const originalEventSpan = originalService.getElementsByClassName("event-inline")[0];

            const REMOVE_MARGIN_THRESHOLD = 1000; // TODO put this elsewhere, possibly calculate it
            
            if (originalEventSpan.childElementCount === REMOVE_MARGIN_THRESHOLD) {
                const boxes = originalEventSpan.getElementsByTagName("button");
                for (let box of boxes) {
                    box.style.marginLeft = "0px";
                }
            }

            const box = document.createElement("button");
            box.classList.add("service-box");
            box.classList.add(`physical-${node.status()}`);
            box.style.width = `${node.getWidth(this.maxWidth)}px`;
            if (originalEventSpan.childElementCount >= REMOVE_MARGIN_THRESHOLD) {
                box.style.marginLeft = "0px"; // above threshold, we remove the border, otherwise it takes the whole screen
                // box.style.padding = "0";
            };
            box.innerHTML = "";
            box.title = node.metadata();
            originalEventSpan.appendChild(box);
            original !== node && this.id2dom.set(node.id, box);
            
            // for (let j = 0; j< Math.random() * 10; j++) {
            //     const box = document.createElement("button");
            //     box.classList.add("service-box");
            //     box.classList.add("physical-pending");
            //     box.style.width = `${Math.random() * 500 + 16}px`;
            //     box.innerHTML = "";
            //     originalEventSpan.appendChild(box);
            // };
        }

    }
    
    

    /// Unfold a bunch of nodes at once. It avoids clicking on every
    /// node to unfold them one by one. but it also prevent from unfolding the
    /// whole tree. A good compromise.
    /// TODO implement a depth
    unfold(node, n) {
        if (n === 0) {
            this.fold(node);
            return 0;
        }
        const nDefault = n || 50;
        let nbUnfolded = 1; // this, has been unfolded
        node.unfold = true;
        const dom = this.id2dom.get(node.id);
        if (node.children.length > 0 && dom) {
            const domChildren = dom.getElementsByClassName("children")[0];
            const domButton = dom.getElementsByClassName("fold-unfold")[0];
            if (node.logical !== "service") { domButton.innerHTML = "+" };
            domChildren.style.display = "block";

            let i = 0; 
            while (i < node.children.length) {
                nbUnfolded += this.unfold(node.children[i], nDefault-nbUnfolded);
                ++i;
            }
        }
        return nbUnfolded;
    }

    /// Fold is less difficult: only close the current one will close all bottom
    /// ones.
    fold(node) {
        const dom = this.id2dom.get(node.id);
        const domChildren = dom.getElementsByClassName("children")[0];
        if (domChildren) {
            const domButton = dom.getElementsByClassName("fold-unfold")[0];
            if (node.logical !== "service") { domButton.innerHTML = "-" };
            domChildren.style.display = "none";
            node.unfold = false; // remember
        }
    }
    
    updateNode(node) {
        if (!this.container) {return ;} // not updating the dom node
        const dom = this.id2dom.get(node.id);
        dom.title = node.metadata();
        dom.classList.replace("physical-pending", `physical-${node.status()}`);
        this.maxWidth = Math.max(this.maxWidth, node.getWidth(this.maxWidth));
        dom.style.width = `${node.getWidth(this.maxWidth)}px`;
    }

}
