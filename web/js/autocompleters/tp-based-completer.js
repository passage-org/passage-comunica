
/// Queries the endpoint to retrieve a few example of values
/// from the current triple pattern being type. This is
/// context-insensitive since it does not take into account the
/// other operations of the SPARQL query.
export const TPBasedCompleter = {
    name: "tp-based-completer",
    autoShow: false,
    bulk: false,
    suggestion_variable_name: "suggestion_variable",
    suggestion_variable: "?suggestion_variable",
    cache: new Object(),
    postprocessHints: function (_yasqe, hints) {
        
        return hints.map(hint => {
            hint.render = function(el, self, data){
                console.log(data)
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

                suggestionDiv.appendChild(suggestionValue);
                suggestionDiv.appendChild(suggestionProba);
                
                el.appendChild(suggestionDiv);

                data.text = binding
                // We have to set the text field back to the suggestion only, since that's what's getting written on the editor. 
                // Again, kinda hacky, but works, somehow

                console.log(el)
            }
            return hint
        });
    },
    get: function(yasqe, token) {
        const url = "http://localhost:3332/fedshop200.jnl/raw"

        const acq = this.getAutocompletionQuery(yasqe, token, yasqe.getDoc().getCursor().line)

        console.log("sending query", acq)

        const currentString = token.string

        return Promise.resolve(this.queryWithCache(url, acq, currentString))
    },
    isValidCompletionPosition: function (yasqe) {
        const token = yasqe.getCompleteToken();
        const line = yasqe.getDoc().getCursor().line

        const previousNonWsToken = this.getPreviousNonWsTokenMultiLine(yasqe, line, token); 
        /* const previousLine = previousNonWsToken.line
        const previousPreviousNonWsToken = previousNonWsToken && this.getPreviousNonWsTokenMultiLine(yasqe, previousLine, previousNonWsToken); 
        const nextNonWsToken = this.getNextNonWsTokenMultiLine(yasqe, line, yasqe.getDoc().getCursor().ch + 1)
        const nextLine = nextNonWsToken.line
        const nextNextNonWsToken = nextNonWsToken && this.getNextNonWsTokenMultiLine(yasqe, nextLine, nextNonWsToken.end + 1) */

        /* console.log("previous previous token", previousPreviousNonWsToken);
        console.log("previous token", previousNonWsToken);
        console.log("current token", token);
        console.log("next token", nextNonWsToken);
        console.log("next next token", nextNextNonWsToken); */

        // if (token.string.length == 0) return false; //we want -something- to autocomplete
        if (this.canWriteObject(previousNonWsToken)) return false;
        if (token.string[0] === "?" || token.string[0] === "$") return false; // we are typing a var
        if (token.type === "keyword") return false; // if we're at the end of a keyword, move on
        if (token.type === "error" && !token.string.startsWith("\"")) return false; // if we started writing a uri, it's considered "punc", so no issue. if we start writing anything else, it's considered an error. We skip every error unless the token starts with '"', because this signals we're writing a literal
        // return token.state.possibleFullIri; // when fully typed, the possible full iri is false, which is not convenient
        return true
        // if (token.state.possibleCurrent.indexOf("a") >= 0) return true; // predicate pos
        // return false;
    },
    queryWithCache: async function(url, query, currentString) {
        /* console.log(this.cache)
        console.log(currentString) 
        console.log(query)*/

        // console.log(query)

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
            // .map(value => value.binding)
    },
    query: async function(url, query, currentString) {
        console.log("buozerhfgoszhgzlo")
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

            console.log(suggestions)

            return suggestions
        } catch (error) {
            console.error(error.message);
        }
    },
    isGraph: function(previousToken) {
        return "GRAPH" === previousToken.string;
    },
    canWriteSubject: function(token) {
        return token.state.possibleCurrent.includes("BIND");
    },
    canWritePredicate: function(token) {
        // console.log(token);
        return token.state.possibleCurrent.includes("a");
    },
    canWriteObject: function(token) {
        return !token.state.possibleCurrent.includes("a") && token.state.lastProperty !== "";
    },
    getAutocompletionQuery: function(yasqe, currentToken, line) {
        let subject, predicate, object;

        const previousNonWsToken = this.getPreviousNonWsTokenMultiLine(yasqe, line, currentToken); 
        const previousLine = previousNonWsToken.line
        const previousPreviousNonWsToken = previousNonWsToken && this.getPreviousNonWsTokenMultiLine(yasqe, previousLine, previousNonWsToken); 
        const nextNonWsToken = this.getNextNonWsTokenMultiLine(yasqe, line, yasqe.getDoc().getCursor().ch + 1)
        const nextLine = nextNonWsToken.line
        const nextNextNonWsToken = nextNonWsToken && this.getNextNonWsTokenMultiLine(yasqe, nextLine, nextNonWsToken.end + 1)

        if(this.isGraph(previousNonWsToken)) {
            return "SELECT * WHERE { GRAPH ?suggestion_variable { ?s ?p ?o. } }"
        }

        const graph = this.getPreviousGraphToken(yasqe, currentToken, line)
        const graphString = graph && graph.string

        if(this.canWriteSubject(currentToken)){
            subject = this.suggestion_variable;
            predicate = (nextNonWsToken && this.canWritePredicate(nextNonWsToken) && nextNonWsToken.string) || "?predicate_placeholder";
            object = (nextNextNonWsToken && this.canWriteObject(nextNextNonWsToken) && nextNextNonWsToken.string) || "?object_placeholder";
        } else 

        if(this.canWritePredicate(currentToken)){
            subject = (previousNonWsToken && this.canWriteSubject(previousNonWsToken) && previousNonWsToken.string) || "?subject_placeholder";
            predicate = this.suggestion_variable;
            object = (nextNonWsToken && this.canWriteObject(nextNonWsToken) && nextNonWsToken.string) || "?object_placeholder";
        } else 

        if(this.canWriteObject(currentToken)){
            subject = previousPreviousNonWsToken && this.canWriteSubject(previousPreviousNonWsToken) && previousPreviousNonWsToken.string || "?subject_placeholder";
            predicate = (previousNonWsToken && this.canWritePredicate(previousNonWsToken) && previousNonWsToken.string) || "?predicate_placeholder";
            object = this.suggestion_variable;
        } else {
            console.log("COULDN'T DETERMINE CURRENT TOKEN TYPE. CURRENT TOKEN : ")
            console.log(currentToken)
        }

        const query = graph ? 
        `SELECT * WHERE { GRAPH ${graphString} { ${subject} ${predicate} ${object}. } }`
        : `SELECT * WHERE { ${subject} ${predicate} ${object}. }`

        return query
    },
    getPreviousGraphToken: function(yasqe, currentToken, startingLine) {
        let line = startingLine;

        let curr = currentToken;
        let prev = this.getPreviousNonWsTokenMultiLine(yasqe, line, curr);

        line = prev.line;

        let count = 0;
        let graph = null;

        const shouldStop = function(previousToken){
            return previousToken.state.stack.length === 1 && previousToken.state.stack[0] === "sparql11"
        };
        

        while(!shouldStop(prev)){

            if(curr.string === "{") count++;
            if(curr.string === "}") count--;
            
            if(prev.string.toLowerCase() === "graph") {
                graph = count > 0 ? curr : null;
                break;
            }

            curr = prev;
            prev = this.getPreviousNonWsTokenMultiLine(yasqe, line, curr);
            line = prev.line;
        }
        
        return graph;
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
    getPreviousNonWsTokenMultiLine: function(yasqe, line, currentToken){
        let previous = yasqe.getPreviousNonWsToken(line, currentToken);
        
        if(!previous.type && previous.start === 0 && line > 0) {
            // beginning of line and not first line = we need to look at the end of previous line 
            previous.start = Number.MAX_SAFE_INTEGER 
            /* Looks really bad, but needed because of how previous token are retrieved example :  
            1    token1
            2  token2
            3           token3
            4
            yasqe.getPreviousNonWsToken(2, token3) = token2
            yasqe.getPreviousNonWsToken(1, token2) = <empty token>
            */
            return this.getPreviousNonWsTokenMultiLine(yasqe, line - 1, previous);
        }

        previous.line = line;
        return previous;
    },
    getNextNonWsTokenMultiLine: function(yasqe, line, currentPos){
        let next = yasqe.getNextNonWsToken(line, currentPos)

        if (next && !next.type) return this.getNextNonWsTokenMultiLine(yasqe, line, next.end + 1);

        if (!next && line < yasqe.getDoc().lineCount() - 1) return this.getNextNonWsTokenMultiLine(yasqe, line + 1, 0);

        if (next) next.line = line;

        return next;
    }
};
