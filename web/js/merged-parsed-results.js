
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
        this.refresh = null;
    }

    appendResponse(response) {
        this.lastAppend = Date.now();
        const vars = response.vars;
        const bindings = response.bindings;
        this.vars = Array.from(new Set(this.vars.concat(vars)));
        // this.bindings = this.bindings.concat(bindings);
        if (Array.isArray(bindings)) {
            // complexity O(|bindings|)
            for (const binding of bindings) {this.bindings.push(binding);}
        } else {
            this.bindings.push(bindings); // complexity O(1)
        }
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
        return this.bindings.length < 50 || Date.now() - this.lastAppend > 1000;
    }

    whenMoreCalm(callback) {
        return;
        if (this.bindings.length < 50) {
            callback();
        } else {
            if (Date.now() - this.lastAppend < 1000) {
                if (this.refresh) {
                    clearTimeout(this.refresh);
                }
                this.refresh = setTimeout(callback, 1000);
            } else {
                this.refresh = null;
                callback();
            }
        }
        // this.bindings.length < 50 || Date.now() - this.lastAppend > 1000;
    }
    
}
