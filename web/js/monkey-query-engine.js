import {MonkeyResponseChip} from '/js/views/monkey-response-chip.js';
import Passage from '/passage-comunica-engine.js';
import MergedParsedResults from '/js/merged-parsed-results.js';
import {LoggerPretty} from '@comunica/logger-pretty';

/// Instead of using the default yasqe query executor that fetches the
/// result, we use passage-comunica to retrieve them.
/// It requires slight modification to the default behavior of yasgui.

export class MonkeyQueryEngine {
    
    constructor(yasqe, yasr) {
        this.yasqe = yasqe;
        this.yasr  = yasr;
        this.responseChip = new MonkeyResponseChip(this.yasr);
        this.reset();
        this.yasr.results.stop();
        this.stop(); // start stopped
    }

    // start the query execution. The query
    // button becomes stoppable.
    start () {
        this.yasqe.queryBtn.onclick = () => {
            this.yasqe.req = false; // click state
            this.yasqe.updateQueryButton();
            this.yasqe.queryBtn.title = "run query";
            this.configEngine.abort.value = true;
            this.configEngine.log.log = (level, color, message, data) => {
                // muted
            };
            
            this.stop(); // becomes startable
        };
    }

    // clean the underlying structure to allow yasgui to restart
    // a SPARQL query.
    reset () {
        this.yasr.results = new MergedParsedResults();
        this.yasqe.req = false; // this is about the click on queryBtn.
        if (this.resultIterator) { // this states that it actually started
            // so we remove all listener to start fresh
            this.resultIterator.removeAllListeners();
            this.resultIterator = null;
        }
        this.yasr.draw(); // reset the view of results
    }

    forceStartedButton() {
        this.yasqe.req = true;
        this.yasqe.queryStatus = "valid";
        this.yasqe.updateQueryButton("valid");
        this.yasqe.queryBtn.title = "stop query";
    }
    
    forceErrorButton(err) {
        console.log(err);
        this.reset(); // reset the results as well
        this.yasqe.queryBtn.title = "run query";
        this.yasqe.updateQueryButton("error");
        this.responseChip.stop();
    }

    forceDoneButton() {
        this.yasr.results.stop();
        if (this.resultIterator) { // this states that it actually started
            // so we remove all listener to start fresh
            this.resultIterator.removeAllListeners();
            this.resultIterator = null;
        }
        this.yasr.draw();
        this.yasqe.req = false;
        this.yasqe.queryBtn.title = "run query";
        this.yasqe.updateQueryButton();
        this.responseChip.stop();
        this.stop(); // becomes startable
        console.log('We are done with the query!');
    }
    
    // stop the query execution. The query button
    // becomes startable.
    stop () {
        this.yasqe.queryBtn.onclick = () => {
            this.yasqe.queryBtn.onclick = () => {}; // disabled
            this.reset(); // reset as soon as the button has been clicked to start a new execution
            this.responseChip.start();

            // update the queryBtn to be in execution state.
            this.forceStartedButton();

            const query = this.yasqe.getDoc().getValue();
            const requestConfig = this.yasqe.config.requestConfig(); // headers and all.
            console.log("Executing the following SPARQL query on " + requestConfig.endpoint + ": \n" + query);
            this.configEngine = {
                sources: [requestConfig.endpoint], // always only one endpoint
                log: this.yasr.plugins['Log'].getLogger(), // allows retrieving the logging from comunica
                physicalQueryPlanLogger: this.yasr.plugins['Plan'].getLogger(), // create the physical plan
                abort: {value: false}, // allows stopping the query execution when needed
            };

            Passage.PassageFactory().query(query, this.configEngine).then(async (result) => {
                this.start(); // becomes stopable
                switch (result.resultType) {
                case 'bindings': this.resultIterator = await result.execute(); break;
                default: throw new Exception();
                };
                this.resultIterator.on('error', () => this.forceErrorButton());
                this.resultIterator.on('end', ()  => this.forceDoneButton());
                this.resultIterator.on('data', (result) => {
                    // put back the data as if it was the result of one standard call to
                    // a SPARQL enpdoint…
                    const jsonBindings = Object.fromEntries([...result].map(([key, value]) => {
                        let type = null;
                        switch (value.termType) {
                        case 'NamedNode' : type = 'uri';     break;
                        case 'Literal'   : type = 'literal'; break;
                        case 'BlankNode' : type = 'bnode';   break;
                        default: console.log('Unhandled type: ' + value.termType); 
                        };                        
                        const jsonValue = {
                            value: value.value,
                            type: type,
                            datatype: value && value.datatype && value.datatype.value,
                        };
                        
                        return [key.value, jsonValue];
                    }));
                    
                    this.yasr.results.appendResponse({vars: Object.keys(jsonBindings), bindings: jsonBindings});
                    
                    this.yasr.results.whenMoreCalm(()=>{this.yasr.plugins['table'].draw();});
                    // not emitting to avoid all calls to stringify 
                    // yasqe.emit("queryResponse", mergedResults);
                });
            }).catch((err) => {
                console.log('TODO: handle error properly : ', err);
            });
           
        };
    }


    
}
