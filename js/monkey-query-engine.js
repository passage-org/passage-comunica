import {MonkeyResponseChip} from "/js/views/monkey-response-chip.js";
import Passage from "/passage-comunica-engine.js";
import MergedParsedResults from "/js/merged-parsed-results.js";
import {LoggerPretty} from "@comunica/logger-pretty";
import {MessageStart, MessageAbort} from "/js/workers/task-messages.js";
import {MessageRouter} from "/js/workers/message-router.js";

/// Instead of using the default yasqe query executor that fetches the
/// result, we use passage-comunica to retrieve them.
/// It requires slight modification to the default behavior of yasgui.
export class MonkeyQueryEngine {

    yasr; // the result part of yasgui
    yasqe; // the editor part of yasgui
    shaper; // the shape configuration for passage x comunica
    responseChip; // the monkey-patched tooltip printing the number of results and time
    worker;
    router;
    
    constructor(yasqe, yasr, shaper) {
        this.shaper = shaper;
        this.yasqe = yasqe;
        this.yasr  = yasr;
        this.responseChip = new MonkeyResponseChip(this.yasr);
        this.reset();
        this.yasr.results.stop();
        this.stop(); // start stopped
        this.router = new MessageRouter(this, this.yasr.plugins["Log"], this.yasr.plugins["Plan"]);
    }


    // clean the underlying structure to allow yasgui to restart
    // a SPARQL query.
    reset () {
        this.yasr.results = new MergedParsedResults();
        this.yasr.plugins["Log"] && this.yasr.plugins["Log"].reset();
        this.yasr.plugins["Plan"] && this.yasr.plugins["Plan"].reset();
        this.yasqe.req = false; // this is about the click on queryBtn.
        this.worker && this.worker.terminate(); // should: this.worker.removeAllListeners() ?
        this.yasr.draw(); // reset the view of results
    }

    forceStartedButton() {
        this.yasqe.req = true;
        this.yasqe.queryStatus = "valid";
        this.yasqe.updateQueryButton("valid");
        this.yasqe.queryBtn.title = "stop query";
    }
    
    forceErrorButton(err) {
        console.log("Error: ", err);
        this.reset(); // reset the results as well
        this.yasr.results.stop();
        this.yasqe.queryBtn.title = "run query";
        this.yasqe.updateQueryButton("error");
        this.responseChip.stop();
        this.stop();
    }

    forceDoneButton() {
        this.yasr.results.stop();
        this.worker && this.worker.terminate();
        this.yasr.draw();
        this.yasqe.req = false;
        this.yasqe.queryBtn.title = "run query";
        this.yasqe.updateQueryButton("valid");
        this.responseChip.stop();
        this.stop(); // becomes startable
        console.log("We are done with the query!");
    }
    
    // stop the query execution. The query button
    // becomes startable.
    stop () {
        this.yasqe.queryBtn.onclick = () => {
            this.yasqe.queryBtn.onclick = () => {}; // disabled
            this.reset(); // reset as soon as the button has been clicked to start a new execution
            this.responseChip.start();
            this.forceStartedButton(); // update the queryBtn to be in execution state.

            const query = this.yasqe.getDoc().getValue();
            const requestConfig = this.yasqe.config.requestConfig(); // headers and all.
            const shape = this.shaper.toJson();
            
            console.log("Executing the following SPARQL query on " + requestConfig.endpoint + ": \n" + query);
            // list of available key/value: https://comunica.dev/docs/query/advanced/context/

            // TODO conditionally, when workers are not enabled, execute the query old-school with
            //      possible slows down when the query is big to optimize.
            this.worker = new Worker(new URL("/js/workers/task-execute-query.js", import.meta.url), { type: "module" });
            this.worker.postMessage(new MessageStart(query, requestConfig, shape));

            this.worker.onmessage = (event) => {
                this.router.routeMessageFromWorker(event.data);
            };

            this.start(); // becomes stopable
        };
    }


    // start the query execution. The query
    // button becomes stoppable.
    start () {
        this.yasqe.queryBtn.onclick = () => {
            this.yasqe.req = false; // click state
            this.yasqe.updateQueryButton();
            this.yasqe.queryBtn.title = "run query";
            this.worker && this.worker.postMessage(new MessageAbort());
            this.stop(); // becomes startable
        };
    }
}
