/// Notification of the initialization of a physical node.
export class MessagePhysicalPlanInit {
    type = "MessagePhysicalPlanInit";
    constructor(lo, pn, n, m) {
        this.date = Date.now();
        this.lo = lo;
        this.pn = pn;
        this.n = n;
        this.m = m;
    }
}

/// Appends the metadata to the node.
export class MessagePhysicalPlanAppend {
    type = "MessagePhysicalPlanAppend";
    constructor(n, m) {
        this.date = Date.now();
        this.n = n;
        this.m = m;
    }
}

/// Ask the worker to start an execution, it contains the
/// parameters necessary to start a proper one.
export class MessageStart {
    type = "MessageStart";
    constructor(query, config, shape) {
        this.query = query;
        this.config = config;
        this.shape = shape;
    }
}

/// Ask the worker to stop the execution as soon as possible.
/// Then it provides the results.
export class MessageAbort {
    type = "MessageAbort";
}

/// A message notifying a new log from comunica within the
/// worker.
export class MessageComunicaLog {
    type = "MessageComunicaLog";
    constructor(level, message, date) {
        this.level = level;
        this.message = message;
        this.date = date;
    }
}

/// A message that reports an exception to the main
/// threads from the worker.
export class MessageException {
    type = "MessageException";
    constructor(exception) {
        this.exception = exception;
    }
}

/// A message signaling the proper completion of the
/// worker to the main thread.
export class MessageDone {
    type = "MessageDone";
    // nothing
}

/// A message that reports a new result from the worker
/// to the main thread.
export class MessageBindings {
    type = "MessageBindings";
    constructor(bindings) {
        this.bindings = bindings;
        this.vars = Object.keys(bindings);
    }
}

