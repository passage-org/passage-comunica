import {MessageStart, MessageException, MessageBindings, MessageDone} from "/js/workers/task-messages.js";
import {TaskComunicaLog} from "/js/workers/task-comunica-log.js";
import {TaskPhysicalPlanLogger} from "/js/workers/task-physical-plan-logger.js";
import Passage from '/passage-comunica-engine.js';

let confEngine = null;

self.onmessage = (event) => {
    switch (event.data.type) { // process the event's data
    case "MessageStart":
        const message = event.data;
        const headers = new Headers();
        message.config.args.forEach(e => {headers.set(e.name, e.value);});


        confEngine = {
            sources: [message.config.endpoint], // always only one endpoint
            headers: headers,
            shape: message.shape,
            log: new TaskComunicaLog(self, {level: "info"}), // allows retrieving the logging from comunica
            physicalQueryPlanLogger: () => new TaskPhysicalPlanLogger(self), // create the physical plan
            abort: {value: false}, // allows stopping the query execution when needed
        };
        return execute(message.query, confEngine); // returns void but w/e
    case "MessageAbort":
        confEngine.abort.value = true;
        confEngine.log.log = (level, color, message, data) => {
            // muted
        };
        return;
    default: return self.postMessage(
        new MessageException(`The worker does not understand the message ${JSON.stringify(event)}`));
    };
};

function execute(query, config) {
    let resultIterator = null;
    Passage.PassageFactory().query(query, config).then(async (result) => {
        switch (result.resultType) {
        case "bindings": resultIterator = await result.execute(); break;
        default: self.postMessage(
            new MessageException(
                new Exception(`Should get an iterator of bindings but gets something else: ${result.resultType}`)));
        };
        resultIterator.on('error', (e) => self.postMessage(new MessageException(e)));
        resultIterator.on('end', () =>  self.postMessage(new MessageDone()));
        resultIterator.on('data', (result) => {
            // put back the data as if it was the result of one standard call to
            // a SPARQL enpdoint…
            const jsonBindings = Object.fromEntries([...result].map(([key, value]) => {
                let type = null;
                switch (value.termType) {
                case "NamedNode" : type = "uri";     break;
                case "Literal"   : type = "literal"; break;
                case "BlankNode" : type = "bnode";   break;
                default: console.log('Unhandled type: ' + value.termType); 
                };                        
                const jsonValue = {
                    value: value.value,
                    type: type,
                    datatype: value && value.datatype && value.datatype.value,
                };
                
                return [key.value, jsonValue];
            }));
            
            self.postMessage(new MessageBindings(jsonBindings));
        });
    }).catch((e) => {
        self.postMessage(new MessageException(e));
    });
}
