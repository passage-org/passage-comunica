import {MonkeyResponseChip} from '/js/views/monkey-response-chip.js';
import Passage from '/passage-comunica-engine.js';
import MergedParsedResults from '/js/merged-parsed-results.js';

/// Instead of using the default yasqe query executor that fetches the
/// result, we use passage-comunica to retrieve them.
/// It requires slight modification to the default behavior of yasgui.

export class MonkeyQueryEngine {
    
    constructor(yasqe, yasr) {
        this.yasqe = yasqe;
        this.yasr  = yasr;
        this.responseChip = new MonkeyResponseChip(this.yasr);
        this.stop(); // start stopped
    }

    // start the query execution. The query
    // button becomes stoppable.
    start () {
        this.yasqe.queryBtn.onclick = () => {
            console.log('stop');
            this.yasqe.req = undefined;
            this.yasqe.updateQueryButton();
            this.yasqe.queryBtn.title = "run query";
            this.yasqe.passageConfig.abort.value = true; 
            this.stop(); // becomes startable
        };
    }


    // stop the query execution. The query button
    // becomes startable.
    stop () {
        this.yasqe.queryBtn.onclick = () => {
            console.log('start');
            this.yasqe.req = true;
            this.yasqe.queryStatus = "valid";
            this.yasqe.updateQueryButton("valid");
            this.yasqe.queryBtn.title = "stop query";

            const mergedResults = new MergedParsedResults();
            this.yasr.results = mergedResults;
            this.yasr.draw();

            const query = this.yasqe.getDoc().getValue();
            const requestConfig = this.yasqe.config.requestConfig(); // headers and all.
            const endpoint = requestConfig.endpoint;
            console.log("Executing the following SPARQL query on " + endpoint + ": \n" + query);
            const configEngine = {
                sources: [endpoint],
                log: this.yasr.plugins['Log'].getLogger(), // allows retrieving the logging from comunica
                physicalQueryPlanLogger: this.yasr.plugins['Plan'].getLogger(), // create the physical plan
                abort: {value: false}, // allows stopping the query execution when needed
            };
            const engine = Passage.PassageFactory();
            this.yasqe.passageConfig = configEngine;
            this.responseChip.start();

            const self = this;
            engine.query(query, configEngine).then(async function (result) {
                let resultsIterator = null;
                switch (result.resultType) {
                case 'bindings':
                    resultsIterator = await result.execute();
                    break;
                };

                self.yasqe.req = resultsIterator;
                
                resultsIterator.on('error', function(e) {
                    self.yasqe.req = undefined;
                    self.yasqe.queryBtn.title = "run query";
                    self.yasqe.updateQueryButton("error");
                    self.responseChip.stop();
                });

                resultsIterator.on('end', function() {
                    // TODO better handling of query button
                    mergedResults.stop();
                    self.yasr.draw();
                    self.yasqe.req = undefined;
                    self.yasqe.queryBtn.title = "run query";
                    self.yasqe.updateQueryButton();
                    self.responseChip.stop();
                    console.log('We are done with the query!');
                });

                resultsIterator.on('data', function (result) {
                    // put back the data as if it was the result of one standard call to
                    // a SPARQL enpdoint…
                    const jsonBindings = Object.fromEntries([...result].map(([key, value]) => {
                        let type = null;
                        switch (value.termType) {
                        case "NamedNode": type = 'uri'; break;
                        case "Literal": type = 'literal'; break;
                        case "BlankNode" : type = 'bnode'; break;
                        default: console.log("Unhandled type: " + value.termType); 
                        };
                        let datatype = value && value.datatype && value.datatype.value;
                        
                        const jsonValue = {
                            value: value.value,
                            type: type,
                            datatype: datatype,
                        };
                        
                        return [key.value, jsonValue];
                    }));

                    const vars = Object.keys(jsonBindings);

                    const response = {vars: vars, bindings: jsonBindings};
                    mergedResults.appendResponse(response);

                    self.yasr.results = mergedResults;
                    if (mergedResults.isMoreCalm()) {
                        // TODO it would be better to change the table plugin
                        //      so it appends the new data instead of destroying
                        //      then printing anew.
                        self.yasr.plugins['table'].draw();
                    };
                    // yasr.updateResponseInfo();
                    // not emitting to avoid all calls to stringify 
                    // yasqe.emit("queryResponse", mergedResults);
                });
            });
            

            
            this.start(); // becomes stopable
        };
    }


    
}
