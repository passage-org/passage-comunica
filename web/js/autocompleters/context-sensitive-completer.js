
/// Queries the endpoint to retrieve a few example of values
/// from the current triple pattern being type. This is
/// context-insensitive since it does not take into account the
/// other operations of the SPARQL query.
export const CSCompleter = {
    name: "context-sensitive-completer",
    autoShow: false,
    bulk: false,
    cache: new Object(),
    suggestion_variable_name: "suggestion_variable",
    suggestion_variable: "?suggestion_variable",
    // interface methods 
    get: function(yasqe, token) {
        const acq = this.getAutocompletionQuery(yasqe, token);

        console.log("acq : ", acq);

        const currentString = token.string

        const url = yasqe.config.requestConfig().endpoint

        return Promise.resolve(this.queryWithCache(url, acq, currentString));
        // return Promise.resolve(["THESE", "AREN'T", "ACTUAL", "SUGGESTIONS", "DUMMY"]);
    },
    isValidCompletionPosition: function (yasqe) {
        // const token = yasqe.getCompleteToken();

        return true;
    },


    postprocessHints: function (_yasqe, hints) {
        
        return hints.map(hint => {
            hint.render = function(el, self, data){
                const binding = data.displayText.binding
                const proba = data.displayText.proba
                // We store an object in the displayTextField. Definitely not as intented, but works (...?)

                const suggestionDiv = document.createElement("div");

                const suggestionValue = document.createElement("span");
                suggestionValue.textContent = binding || "";

                const suggestionProba = document.createElement("span");
                suggestionProba.textContent = "  " + (proba || "");
                // This added space feels out of place, but it works. Used to prevent texts from suggestion and proba being directly next to each other.
                suggestionProba.style.cssFloat = "right";
                suggestionProba.style.color = "";

                suggestionDiv.appendChild(suggestionValue);
                suggestionDiv.appendChild(suggestionProba);
                
                el.appendChild(suggestionDiv);

                data.text = binding

                // Prevents autocompleted tokens from eating end of line periods, colons and semicolons
                // self.to.ch = self.to.ch - 1;

                // console.log("data", data);
                // console.log("self", self);
                // We have to set the text field back to the suggestion only, since that's what's getting written on the editor. 
                // Again, kinda hacky, but works, somehow

                // console.log(el)
            }
            return hint
        });
    },





    queryWithCache: async function(url, query, currentString) {

        if(this.cache[query]){
            if(this.cache[query].lastString === currentString){
                const res = await Promise.resolve(this.query(url, query, currentString))
                this.cache[query].results = this.cache[query].results.concat(res)
            }
        } else {
            const res = await Promise.resolve(this.query(url, query, currentString))
            this.cache[query] = new Object()
            this.cache[query].results = res
        }
        this.cache[query].lastString = currentString
        // this.cache[query].results
        return this.cache[query].results
            .filter(result => result.sugg.includes(currentString) || result.sugg.includes(currentString.substring(1))) // filter results by currently typed string
            .sort((a, b) => b.proba - a.proba) // sort by lower proba first (lower proba = higher cardinality)
            .map(result => {return {binding: this.typedStringify(result.sugg, result.type), proba: result.proba}}) // show only the entity, properly written based on its type, not its probability (though it may be interesting to have both, even for the user!!)
            .filter((bindingAndProba, index, array) => array.findIndex(elt =>elt.binding === bindingAndProba.binding) === index) // distinct elements
            //.map(value => value.elt + " // " + (1 / value.proba))
            //.map(value => value.binding)
    },

    query: async function(url, query, currentString) {
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({ "query" : query }),
            });
            
            if (!response.ok) {
                throw new Error(`Response status: ${response.status}`);
            }

            const json = await response.json();
            const suggestions = Array.from(
                new Set(
                    json["results"]["bindings"]
                    .filter(b => b[this.suggestion_variable_name]) // safety measure, in case something goes wrong and bindings don't have mapping for suggestion_variable
                    .map(b => {
                        return {sugg: b[this.suggestion_variable_name]["value"], 
                                proba: b["probabilityOfRetrievingRestOfMapping"]["value"] || 0,
                                type: b[this.suggestion_variable_name]["type"],
                            } 
                        })
                )
            )

            // console.log(suggestions)

            return suggestions
        } catch (error) {
            console.error(error.message);
        }
    },


    getAutocompletionQuery: function(yasqe, token) {

        // step 1 : get all tokens
        const tokens = this.getTokensFromCurrentContext(yasqe, token);

        // step 2 : generate relevant context

        // Already computed in getTokensFromCurrentContext. Might want to compute it once and keep it as part of the method's returned object
        const currentTokenIndex = tokens.findIndex(tkn => tkn.isCurrentToken);

        const incompleteTriple = this.getIncompleteTriple(tokens, currentTokenIndex);
        
        const contextTriples = [];
        const variables = [...incompleteTriple.variables];

        const acqTriple = this.getACQueryTripleTokens(
            yasqe.getDoc().getCursor().line, 
            yasqe.getDoc().getCursor().ch,
            incompleteTriple.entities);

        let context = [...tokens];

        // We replace the tokens of the incomplete triple by fake tokens
        // Thus, we inject our triple into the context 
        context.splice(
            incompleteTriple.start, 
            incompleteTriple.end - incompleteTriple.start + 1, 
            acqTriple.subject, acqTriple.predicate, acqTriple.object,
            {type:"fake", string: "."});

        for(let i = 0; i < context.length; i++){
            try {
                const triple = this.getTriple(context, i);
                i = triple.end;
                contextTriples.push(triple);
            } catch (error) {
                // console.log(error)
            }
        }

        let lastSize = 0;
        while(lastSize !== variables.length){
            lastSize = variables.length;

            // Add all variables linked to the variables of the triple being written. Doesn't look good
            // TODO : find more efficient / elegant way to do this :S
            for(const tp of contextTriples){
                for(const variable of tp.variables){
                    if(variables.includes(variable)){
                        for(const tpVar of tp.variables){
                            if(!variables.includes(tpVar)){
                                variables.push(tpVar);
                            }
                        }
                        
                        tp.tokens.forEach(tkn => tkn.outOfContext = false);
                        break;
                    }
                }
            }
        }

        // Remove triples that don't join whatsoever with the triple being written
        context = context.filter(tkn => !tkn.outOfContext);
        
        const prefixes = this.getACQPrefixes(yasqe);

        const acqString = `${prefixes} SELECT * WHERE ${this.stringifyTokenGroup(context)}`; 

        return acqString;
    },


    getACQPrefixes: function(yasqe){
        const prefixes = yasqe.getPrefixesFromQuery();
        const prefixStrings = [];

        for (const [key, value] of Object.entries(prefixes)){
            prefixStrings.push(`PREFIX ${key}: <${value}>`);
        }

        return prefixStrings.join(" ");
    },

    getTokensFromCurrentContext: function(yasqe) {
        const line = yasqe.getDoc().getCursor().line;
        const ch = yasqe.getDoc().getCursor().ch;

        const nbLines = yasqe.getDoc().size; //number of lines
        let tokenArray = [];

        for(let i = 0; i < nbLines; i++){
            const lineTokens = yasqe.getLineTokens(i);

            // mark the current token in the array
            if(line === i){lineTokens.forEach(tkn => {if(tkn.start <= ch && ch <= tkn.end){tkn.isCurrentToken = true}});}

            tokenArray = tokenArray.concat(lineTokens);
        }

        tokenArray = tokenArray.filter(tkn => tkn.type != "ws" || tkn.isCurrentToken);

        const currentTokenIndex = tokenArray.findIndex(tkn => tkn.isCurrentToken);

        const preContext = this.getAllPreviousTokensFromContextAndBracketCount(tokenArray, currentTokenIndex);

        // works only for unfinished but well bracketed queries
        let arr1 = preContext.preContextTokens;

        let arr2 = this.getAllNextTokensFromContext(tokenArray, currentTokenIndex + 1, preContext.bracketCount);

        return arr1.concat(arr2);
    },

    getAllPreviousTokensFromContextAndBracketCount: function(tokenArray, startingTokenIndex){
        let prev = tokenArray[startingTokenIndex];

        let skipUnion = false;
        let skipPrev = false;
        let endOfUnion = [];
        let preContextTokens = [];

        const shouldStop = function(index){
            return index < 0;
        };

        let count = 0;
        let index = startingTokenIndex;

        while(!shouldStop(index)){

            if(prev.string === "{") count++;
            if(prev.string === "}") count--;

            if(skipUnion && count === endOfUnion.at(-1)){ // We've closed the brackets for that union branch
                skipUnion = false;
                skipPrev = true; // We're on the closing bracket of a union branch we want to skip. We do not want that closing bracket, we want everything after
                endOfUnion.pop();
            }

            if(prev.string.toLowerCase() === "union" && count > 0){ // We are coming across a union while having started inside one of its branches
                skipUnion = true;
                endOfUnion.push(count);
            }
            
            if(!skipUnion && !skipPrev){
                preContextTokens.push(prev);
            }

            skipPrev = false;

            index--;
            prev = tokenArray[index];
        }

        preContextTokens.reverse(); // Reverse order to get first token of the query body first in the array
        while(preContextTokens[0].string !== "{") preContextTokens.shift(); // Remove everything until the first bracket (after the WHERE)
        return {preContextTokens: preContextTokens, bracketCount: count};
    },

    getAllNextTokensFromContext: function(tokenArray, startingTokenIndex, bracketCount){
        // Variables to keep track of where we are inside the query / scope
        let skipUnion = false;
        let skipNext = false;
        let endOfUnion = [];
        let postContextTokens = [];
        let count = 0;
        let index = startingTokenIndex;

        let next = tokenArray[startingTokenIndex];

        const shouldStop = function(count, index){
            return count + bracketCount === 0 || index >= tokenArray.length;
        };

        while(!shouldStop(count, index)){

            if(next.string === "{") count++;
            if(next.string === "}") count--;

            if(skipUnion && count === endOfUnion.at(-1)){ // We've closed the brackets for that union branch
                skipUnion = false;
                skipNext = true; // We're on the closing bracket of a union branch we want to skip. We do not want that closing bracket, we want everything after
                endOfUnion.pop();
            }

            if(next.string.toLowerCase() === "union" && count < 0){ // We are coming across a union while having started inside one of its branches
                skipUnion = true;
                endOfUnion.push(count);
                // if(tokenArray.at(-1).string.toLowerCase() === "UNION") tokenArray.pop() // kind of brutal, but we remove the union token a posteriori
            }

            if(!skipUnion && !skipNext){
                postContextTokens.push(next);
            }

            skipNext = false;

            index++;
            next = tokenArray[index]
        }

        if(shouldStop(count, next)) return postContextTokens;
        throw new Error("The query couldn't be parsed : brackets not well formed")
    },


    getTriple: function(tokenArray, index){
        let triple = {};
        triple.variables = [];

        const before = this.getTripleBefore(tokenArray, index);
        const beforeLength = before.length;

        const after = this.getTripleAfter(tokenArray, index + 1);
        const afterLength = after.length;

        const tripleTokens = before.concat(after);

        const entities = this.getTokenGroupsOfTriple(tripleTokens);

        if(entities.length === 0 || entities.length > 3) throw new Error("Not a triple");

        tripleTokens.forEach(elt => {if(elt.type === "atom") triple.variables.push(elt.string)}); // keep all variables

        triple.subject = this.stringifyTokenGroup(entities[0]);
        triple.predicate = this.stringifyTokenGroup(entities[1]);
        triple.object = this.stringifyTokenGroup(entities[2]);

        triple.start = index - beforeLength;
        triple.end = index + afterLength;

        triple.tokens = tripleTokens;
        triple.tokens.forEach(tkn => tkn.outOfContext = true);
        
        return triple;
    },

    getIncompleteTriple: function(tokenArray, index){
        let triple = {};
        triple.variables = [];

        const before = this.getTripleBefore(tokenArray, index);
        const beforeLength = before.length;

        const after = this.getTripleAfter(tokenArray, index + 1);
        const afterLength = after.length;

        const tripleTokens = before.concat(after);

        const entities = this.getTokenGroupsOfTriple(tripleTokens);

        if(entities.length > 3) throw new Error("Not a triple");

        tripleTokens.forEach(elt => {if(elt.type === "atom") triple.variables.push(elt.string)}); // Keep all variables

        triple.tokens = tripleTokens;

        triple.start = index - beforeLength;
        triple.end = index + afterLength;
        
        triple.tokens = tripleTokens;

        triple.entities = entities;

        return triple;
    },


    getACQueryTripleTokens: function(line, ch, entities){
        let subject, predicate, object, filter;

        if(entities.length === 3) throw new Error("Subject, Predicate and Object found. Triple already written.");

        if(entities.length === 0) {
            subject = this.suggestion_variable;
            predicate = "?p";
            object = "?o";
        }

        if(entities.length === 1) {
            
            if(this.isPosBeforeToken(line, ch, entities[0][0])){
                // x [[entity]]
                subject = this.suggestion_variable;
                predicate = "?p";
                object = this.stringifyTokenGroup(entities[0]);
            }

            if(this.isPosAfterToken(line, ch, entities[0].at(-1))){
                // [[entity]] x
                subject = this.stringifyTokenGroup(entities[0]);
                predicate = this.suggestion_variable;
                object = "?o";
            }
        }

        if(entities.length === 2) {

            if(this.isPosBeforeToken(line, ch, entities[0][0])){
                // x [[entity]] [[entity]]
                subject = this.suggestion_variable;
                predicate = this.stringifyTokenGroup(entities[0]);
                object = this.stringifyTokenGroup(entities[1]);
            }

            if(this.isPosBeforeToken(line, ch, entities[1][0]) 
                && this.isPosAfterToken(line, ch, entities[0].at(-1))){
                // [[entity]] x [[entity]]
                subject = this.stringifyTokenGroup(entities[0]);
                predicate = this.suggestion_variable;
                object = this.stringifyTokenGroup(entities[1]);
            }

            if(this.isPosAfterToken(line, ch, entities[1].at(-1))){
                // [[entity]] [[entity]] x
                subject = this.stringifyTokenGroup(entities[0]);
                predicate = this.stringifyTokenGroup(entities[1]);
                object = this.suggestion_variable;
            }


            // one finished entity and another being typed
            // if(this.isPosJustBeforeToken(line, ch, entities[0][0])){
            //     // x[[entity]] [[entity]]
            //     subject = this.suggestion_variable;
            //     predicate = this.stringifyTokenGroup(entities[0]);
            //     object = this.stringifyTokenGroup(entities[1]);
            // }

            // if(this.isPosJustAfterToken(line, ch, entities[0].at(-1))){
            //     // [[entity]]x [[entity]]
            //     subject = this.suggestion_variable;
            //     predicate = this.stringifyTokenGroup(entities[1]);
            //     object = "?o";

            //     filter = `FILTER REGEX (${this.suggestion_variable}, \"^${this.stringifyTokenGroup(entities[0])}\")`;
            // }

            // if(this.isPosJustBeforeToken(line, ch, entities[1][0])){
            //     // [[entity]] x[[entity]]
            //     subject = this.suggestion_variable;
            //     predicate = this.stringifyTokenGroup(entities[0]);
            //     object = this.stringifyTokenGroup(entities[1]);
            // }

            // if(this.isPosBeforeToken(line, ch, entities[1].at(-1))){
            //     // [[entity]] [[entity]]x
            //     subject = this.suggestion_variable;
            //     predicate = this.stringifyTokenGroup(entities[0]);
            //     object = this.stringifyTokenGroup(entities[1]);
            // }
        }

        return {
            subject: {string: subject, type: "fake"}, 
            predicate: {string: predicate, type: "fake"}, 
            object: {string: object, type: "fake"}
        };
    },

    getTokenGroupsOfTriple: function(tokenArray) {
        const entities = [];
        let buffer = [];
        let idx = 0;
        let probe;

        while(tokenArray[idx]) {
            let token = tokenArray[idx];
            buffer.push(token);
            
            switch (token.type) {
                case "variable-3": // uri
                case "string-2": // blank node
                case "atom": // variable
                    entities.push(buffer);
                    buffer = [];
                    break;
                case "number": // number
                case "string": // literal
                    probe = idx + 1;
                    if(tokenArray[probe]){
                        if(tokenArray[probe].type === "meta" && tokenArray[probe].string.startsWith("@")){
                            buffer.push(tokenArray[probe])
                            entities.push(buffer);
                            idx = probe;
                            buffer = [];
                        }else 
                        if(tokenArray[probe].type === "punc" && tokenArray[probe].string === ("^^")){
                            if(tokenArray[probe + 1]){
                                if(tokenArray[probe + 1].type === "variable-3"){
                                    buffer.push(tokenArray[probe]);
                                    buffer.push(tokenArray[probe + 1]);
                                    entities.push(buffer);
                                    idx = probe + 1;
                                    buffer = [];
                                }
                            }else{
                                entities.push(buffer);
                                buffer = [];
                            }
                        }
                    }
                    entities.push(buffer);
                    buffer = [];
                    break;

                case "punc":
                    if(token.string === "." 
                    || token.string === ";"
                    || token.string === ",") break;
                
                case "ws":
                    break;

                default:
                    return []
            }

            idx++;
        }
        
        return entities;
    },


    getTripleBefore: function(tokenArray, index){

        const current = tokenArray[index];

        // Fake token used for the tokens inserted by hand
        if(current.type === "fake") {
            throw new Error("Fake Token; not to be processed here.");
        }

        return this.getTripleBefore_(tokenArray, index);
    },
    

    getTripleBefore_: function(tokenArray, index){
        if(index <= -1) return [];
        const current = tokenArray[index];

        switch (current.type) {
            case "atom":// variable
            case "variable-3": // uri
            case "string": // literal
            case "string-2": // blank node
            case "number": // number
                return this.getTripleBefore_(tokenArray, index - 1).concat([current]);

            case "ws":
                return this.getTripleBefore_(tokenArray, index - 1);

            case "punc": // ^^ or .
                if(current.string === "^^") return this.getTripleBefore_(tokenArray, index - 1).concat([current]);

            case "meta": // @
                if(current.string.startsWith("@")) return this.getTripleBefore_(tokenArray, index - 1).concat([current]);

            default:
                return [];
        }
    },

    getTripleAfter: function(tokenArray, index){
        if (tokenArray[index] && tokenArray[index].type === "punc"){
            switch (tokenArray[index].string) {
                case ".":
                case ",":
                case ";":
                    return [];
                default:
                    break;
            }
        }

        return this.getTripleAfter_(tokenArray, index)
    },

    getTripleAfter_: function(tokenArray, index){
        if(index >= tokenArray.length) return [];
        const current = tokenArray[index];

        switch (current.type) {
            case "atom":// variable
            case "variable-3": // uri
            case "string": // literal
            case "string-2": //blank node
            case "number": // number
                return [current].concat(this.getTripleAfter_(tokenArray, index + 1));

            case "ws":
                return this.getTripleAfter_(tokenArray, index + 1);

            case "punc": // ^^
                if(current.string === "^^") return [current].concat(this.getTripleAfter_(tokenArray, index + 1));
                if(current.string === "." 
                || current.string === ";"
                || current.string === ",") return [current];

            case "meta": // @
                if(current.string.startsWith("@")) return [current].concat(this.getTripleAfter_(tokenArray, index + 1));
            
            default:
                if(current.string === "." 
                || current.string === ";"
                || current.string === ",") return [current];
                return [];
        }
    },

    stringifyTokenGroup: function(tokenArray){
        const strings = [];
        tokenArray.forEach(token => {
            // TODO : change :)
            if(token.string !== "." || strings.at(-1) !== "."){
                strings.push(token.string)
            }
        });
        return strings.join(" ");
    },

    isPosBeforeToken: function(line, ch, token){
        return this.isBefore(line, ch, token.line || line, token.start)
    },

    isBefore: function(line1, ch1, line2, ch2){
        return (line1 === line2 && ch1 < ch2) || line1 < line2;
    },

    isPosAfterToken(line, ch, token){
        return this.isAfter(line, ch, token.line || line, token.end)
    },
    
    isAfter: function(line1, ch1, line2, ch2){
        return (line1 === line2 && ch1 > ch2) || line1 > line2;
    },

    isPosJustBeforeToken: function(line, ch, token){
        return this.isSamePosition(line, ch, token.line || line, token.start)
    },

    isPosJustAfterToken(line, ch, token){
        return this.isSamePosition(line, ch, token.line || line, token.end)
    },

    isSamePosition: function(line1, ch1, line2, ch2){
        return line1 === line2 && ch1 === ch2;
    },

    typedStringify: function(entity, type) {
        switch(type) {
            case 'iri':
              return "<" + entity + ">"
            case 'uri':
              return "<" + entity + ">"
            case 'literal':
                return "\"" + entity + "\""
            default:
              return "UNKNOWN TYPE : " + entity
        }
    },
};








/* 
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?s ?p ?o ?probabilityOfRetrievingRestOfMapping WHERE {
  GRAPH ?g {
  	?s ?p ?s1.
    {
       ?s ?p ?o    .
       "0"^^<http://example.org/ns/userDatatype>   ?o  .
                                                    
       ?o11  ?p12 ?o12.
    }UNION{
      ?s2 ?p2 ?o2.
    }
  }
} 
*/