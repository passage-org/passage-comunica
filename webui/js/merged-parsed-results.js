
/// Yasr has the unwanted tendency to reparse the already parsed json
/// which is highly inefficient… So we return an object with all called
/// function, but without reparse.
export default class MergedParsedResults {

    constructor() {
        this.startAt = Date.now();
        this.lastAppend = Date.now();
        this.stopAt = null;
        this.vars = [];
        this.bindings = [];
        this.lastAppend = Date.now();
    }

    appendResponse(response) {
        this.lastAppend = Date.now();
        const vars = response.vars;
        const bindings = response.bindings;
        this.vars = Array.from(new Set(this.vars.concat(vars)));
        this.bindings = this.bindings.concat(bindings);
    }

    stop() {
        this.stopAt = Date.now();
    }
    
    getVariables() {
        return this.vars;
    }

    getBindings() {
        return this.bindings;
    }

    getOriginalResponseAsString() {
        console.log("stringify");
        return JSON.stringify({
            head: {vars: this.vars},
            results: {bindings: this.bindings}
        }, undefined, 2);
    }

    getType() {
        return 'json';
    }

    getContentType() {
        return 'application/rdf+json';
    }

    getResponseTime() {
        return (this.stopAt || Date.now()) - this.startAt;
    }

    getError() {
        return null;
    }

    isMoreCalm() {
        return Date.now() - this.lastAppend > 1000;
    }
    
}
