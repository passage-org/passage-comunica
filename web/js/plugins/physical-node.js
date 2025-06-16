
/// Node stored in the physical tree plan. 
export class PhysicalNode {

    parent;
    id;
    messages = [];
    children = [];
    
    constructor(n,  pn) {
        this.id = n;
        this.parent = pn;
    }

    update(message) {
        this.messages.push(message);
        return this; // for convenience
    }

    addChild(childNode) {
        this.children.push(childNode);
        return this; // for convenience
    }

    logical() {
        // all messages should have the same logical node
        return this.messages.at(0).lo;
    }

    date() {
        // the first message is often the earlier timestamp
        return this.messages.at(0).date;
    }

    metadata() {
        switch (this.logical()) {
        case "project": return this.messages.at(0).m.vars || "";
        case "service":
            const cardinality = this.messages.reduce((acc,curr) =>
                acc + (curr.m && curr.m.cardinalityReal || 0), 0);
            const queries = this.messages.filter((message) => message.m && message.m.query);
            const timeElapsed = this.messages.reduce((acc,curr) =>
                acc + (curr.m && curr.m.timeLife || 0), 0);
            const timeFirstResult = this.messages.reduce((acc,curr) =>
                acc + (curr.m && curr.m.timeFirstResult || 0), 0);

            const tooltip = [];
            queries.length > 0 && tooltip.push(`query: ${queries.at(0).m.query}\n`);
            this.status() !== "pending" && tooltip.push(`cardinality: ${cardinality}`);
            this.status() !== "pending" && tooltip.push(`execution time: ${timeElapsed}`);
            timeFirstResult > 0 && tooltip.push(`time for first result: ${timeFirstResult}`);
            return tooltip.join("\n");
        default: return "";
        };
    }

    status() { // null, "pending", "error", "completed"
        if (this.logical() !== "service") { return null; };
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
    
}
