import {formatTime,formatDuration} from "/js/utils.js";

/// Node stored in the physical tree plan.
export class PhysicalNode {

    parent;
    id;
    messages = [];
    children = [];
    logical;
    unfold = true;
    
    constructor(n,  pn) {
        this.id = n;
        this.parent = pn;
        this.unfold = !this.parent; // the root is unfolded
    }

    update(message) {
        this.messages.push(message);
        this.logical = message.lo || this.logical; // all messages should have the same logical node
        return this; // for convenience
    }

    addChild(childNode) {
        this.children.push(childNode);
        return this; // for convenience
    }

    date() {
        // the first message is often the earlier timestamp
        return this.messages.at(0).date;
    }

    formatedDate() {
        return formatTime(this.date());
    }

    query() {
        return this.messages && this.messages.filter((message) => message.m && message.m.query).at(0).m.query;
    }

    error() {
        return (this.status() === "error" &&
                this.messages.filter((message) => message.m.status === "error").at(0).m.message) ||
            "";
    }

    stats() {
        if (this.logical !== "service") { return; }
        const tooltip = [];
        const cardinality = this.messages.reduce((acc,curr) =>
            acc + (curr.m && curr.m.cardinalityReal || 0), 0);
        const timeElapsed = this.messages.reduce((acc,curr) =>
            acc + (curr.m && curr.m.timeLife || 0), 0);
        const timeFirstResult = this.messages.reduce((acc,curr) =>
            acc + (curr.m && curr.m.timeFirstResult || 0), 0);
        
        this.status() !== "pending" && tooltip.push(`number of results: ${cardinality}`);
        this.status() !== "pending" && tooltip.push(`execution time: ${formatDuration(timeElapsed)}`);
        timeFirstResult > 0 && tooltip.push(`time for first result: ${formatDuration(timeFirstResult)}`);
        return tooltip.join("\n");
    }

    metadata() {
        switch (this.logical) {
        case "service":
            const cardinality = this.messages.reduce((acc,curr) =>
                acc + (curr.m && curr.m.cardinalityReal || 0), 0);
            const queries = this.messages.filter((message) => message.m && message.m.query);
            const timeElapsed = this.messages.reduce((acc,curr) =>
                acc + (curr.m && curr.m.timeLife || 0), 0);
            const timeFirstResult = this.messages.reduce((acc,curr) =>
                acc + (curr.m && curr.m.timeFirstResult || 0), 0);
            const errorMessages = this.messages.filter((message) => message.m.status === "error");

            const tooltip = [];
            queries.length > 0 && tooltip.push(`[${formatTime(this.date())}] service`);
            queries.length > 0 && tooltip.push(`\n${queries.at(0).m.query}\n`);
            if (this.status() === "error") {
                tooltip.push(`error: ${errorMessages.at(0).m.message}`);
            } else {
                this.status() !== "pending" && tooltip.push(`number of results: ${cardinality}`);
                this.status() !== "pending" && tooltip.push(`execution time: ${formatDuration(timeElapsed)}`);
                timeFirstResult > 0 && tooltip.push(`time for first result: ${formatDuration(timeFirstResult)}`);
            }

            return tooltip.join("\n");
        default: return `[${formatTime(this.date())}] ${this.logical}`;
        };
    }
    
    status() { // null, "pending", "error", "completed"
        if (this.logical !== "service") { return null; };
        // all init should have their corresponding completed field to be complete
        const nbInits = this.messages.filter((e) => e.type === "MessagePhysicalPlanInit").length;
        const nbDones = this.messages.filter((e) => e.m && e.m.doneAt).length;
        const nbErrors = this.messages.filter((e) => e.m && e.m.status &&  e.m.status === "error").length;

        if (nbErrors > 0) {
            return "error";
        } else if (nbDones > 0) {
            return "completed";
        } else {
            return "pending";
        }
    }

    /// Checks if the pattern of logical operators is similar to the other one.
    /// For instance, `project service SELECT * WHERE {?s ?p ?o}` is similar to
    /// `project service SELECT * WHERE {?s ?p ?o} LIMIT 100`.
    isSimilar(other) {
        if (this.logical === other.logical && this.children.length === other.children.length) {
            // approximated so it cost slightly less
            // TODO possibly limit ourselves to service
            for (let child in children) {
                if (!other.children.any(oc => child.isSimilar(oc))) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    isSimilarToParent(parent) {
        if (!parent) {return false; }
        if (this.logical !== "service") { return false; } // focused on services
        if (this.parent.logical === parent.logical &&
            parent.children.filter(c => c.logical === "service").length > 0) {
            return true;
        }
        return false;
    }

    getOriginalService (caller) { // caller is a service
        // TODO improve this, we don't want to enumerate all operators
        if (this.logical === "pattern" || this.logical === "project" || this.logical === "slice" || this.logical === "orderby"
           || this.logical === "join") {
        // if (this.logical === caller.parent.logical) {
            const services = this.children.filter(c => c.logical === "service");
            if (services.length === 1) {
                const service = this.parent && this.parent.getOriginalService(caller); // maybe go higher
                return service || services.at(0); // if not, return this service
            }
        }
        return null;
    }

    previous() {
        if (this.logical !== "service") {return ;}
        const grandParent = this.parent && this.parent.parent;
        if (!grandParent) {return ;}
        if (grandParent.logical === "pattern" || grandParent.logical === "project" ||
            grandParent.logical === "slice" || grandParent.logical === "orderby" ||
            grandParent.logical === "join") {
            const services = grandParent.children.filter(c => c.logical === "service");
            return services.length === 1 && services.at(0) || null;
        }
        return null;
    }
    
    allPrevious() {
        if (this.logical !== "service") {return ;}
        const allPrevious = [];
        let previousService = this.previous();
        while (previousService) {
            allPrevious.push(previousService);
            previousService = previousService.previous();
        }
        return allPrevious.reverse();
    }

    next() {
        if (this.logical !== "service") {return ;}
        const siblings = this.parent && this.parent.children.filter(c => c.logical !== "service");
        if (!siblings || siblings.length <= 0) { return null;}
        const sibling = siblings.at(0);
        const services = sibling.children.filter(c => c.logical === "service");
        return services.length === 1 && services.at(0) || null;
    }

    allNext() {
        if (this.logical !== "service") { return ;}
        const allNext = [];
        let nextService = this.next();
        while (nextService) {
            allNext.push(nextService);
            nextService = nextService.next();
        }
        return allNext;
    }
    
    countServices(childrenCount) {return this.count((c) => c.logical === "service", childrenCount);}
    countChildren(childrenCount) {return this.count((_) => true, childrenCount);}

    count(predicate, childrenCount) {
        let sum = this.children.filter(predicate).length;

        if (!childrenCount) {
            for (let child in this.children) {
                sum += this.children[child].count(predicate);
            }
        } else {
            sum += childrenCount;
        }
        return sum;
    }

    getWidth(defaultWidth) {
        const timeElapsed = this.messages.reduce((acc,curr) =>
            acc + (curr.m && curr.m.timeLife || 0), 0);
        return timeElapsed > 0 ? timeElapsed : defaultWidth; // 10px default
    }

}
