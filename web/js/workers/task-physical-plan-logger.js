import {MemoryPhysicalQueryPlanLogger} from "@comunica/actor-query-process-explain-physical";
import {MessagePhysicalPlanInit, MessagePhysicalPlanAppend} from "/js/workers/task-messages.js";

/// A physical plan logger that aims to exists from within the context of a
/// worker. It slightly processes the new information from the SPARQL engine
/// and routes it towards the plugin if it exists.
export class TaskPhysicalPlanLogger extends MemoryPhysicalQueryPlanLogger {

    n2id = new Map(); // operator_node -> integer_identifier
    
    constructor(worker) {
        super();
        this.worker = worker;
        // this.previousLogOperation = this.logOperation;
        // this.previousAppendMetadata = this.appendMetadata;
    }
    
    /// Return the identifier of the node. If none, it creates one.
    getId (n) {
        if (!this.n2id.has(n)) {
            this.n2id.set(n, this.n2id.size);
        }
        return this.n2id.get(n);
    }


    logOperation (lo, po, n, pn, a, m) {
        super.logOperation(lo, po, n, pn, a, m);
        const message = new MessagePhysicalPlanInit(lo, this.getId(pn), this.getId(n), m)
        this.worker && this.worker.postMessage(message);
    }
    
    appendMetadata (n, m) {
        super.appendMetadata(n, m);
        const message = new MessagePhysicalPlanAppend(this.getId(n), m);
        this.worker && this.worker.postMessage(message);
    }
    
}
