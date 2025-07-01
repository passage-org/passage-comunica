import {LoggerPretty} from '@comunica/logger-pretty';
import {MessageComunicaLog} from "/js/workers/task-messages.js";

/// Simply a class provided to work with Comunica from within a worker context.
export class TaskComunicaLog extends LoggerPretty {
    
    constructor(worker, args) {
        super(args);
        this.worker = worker;
    }

    log (level, color, message, data) {
        // Only forwarding the message through the worker.
        this.worker && this.worker.postMessage(new MessageComunicaLog(level, message, Date.now()));
    }

}
