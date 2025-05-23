
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
    get: function(yasqe, token) {
        const url = "http://localhost:3332/fedshop200.jnl/raw"
        const previousNonWsToken = yasqe.getPreviousNonWsToken(yasqe.getDoc().getCursor().line, token)
        const previousPreviousNonWsToken = previousNonWsToken && yasqe.getPreviousNonWsToken(yasqe.getDoc().getCursor().line, previousNonWsToken)
        const nextNonWsToken = yasqe.getNextNonWsToken(yasqe.getDoc().getCursor().line, yasqe.getDoc().getCursor().ch + 1)
        const nextNextNonWsToken = nextNonWsToken && yasqe.getNextNonWsToken(yasqe.getDoc().getCursor().line, nextNonWsToken.end + 1)


        /* console.log(yasqe.getDoc().getCursor())
        // console.log("previous tokens", previousNonWsToken)
        // console.log("next token", nextNonWsToken)
        console.log("-------")
        console.log("s ", this.isSubject(token))
        console.log("p ", this.isPredicate(token))
        console.log("o ", this.isObject(previousNonWsToken, token))
        console.log("g ", this.isGraph(previousNonWsToken)) */

        const acq = this.getAutocompletionQuery(yasqe, token)

        console.log("sending query", acq)

        const currentString = token.string

        const res = Promise.resolve(this.queryWithCache(url, acq, currentString))

        return res
    },
    isValidCompletionPosition: function (yasqe) {
        const token = yasqe.getCompleteToken();
        const previousNonWsToken = yasqe.getPreviousNonWsToken(yasqe.getDoc().getCursor().line, token)
        const previousPreviousNonWsToken = previousNonWsToken && yasqe.getPreviousNonWsToken(yasqe.getDoc().getCursor().line, previousNonWsToken)
        const nextNonWsToken = yasqe.getNextNonWsToken(yasqe.getDoc().getCursor().line, yasqe.getDoc().getCursor().ch + 1)
        const nextNextNonWsToken = nextNonWsToken && yasqe.getNextNonWsToken(yasqe.getDoc().getCursor().line, nextNonWsToken.end + 1)
        console.log("previous previous token", previousPreviousNonWsToken);
        console.log("previous token", previousNonWsToken);
        console.log("current token", token);
        console.log("next token", nextNonWsToken);
        console.log("next next token", nextNextNonWsToken);

        // if (token.string.length == 0) return false; //we want -something- to autocomplete
        if (token.string[0] === "?" || token.string[0] === "$") return false; // we are typing a var
        if (token.type === "keyword") return false; // if we're at the end of a keyword, move on
        if (token.type === "error" && !token.string.startsWith("\"")) return false; // if we started writing a uri, it's considered "punc", so no issue. if we start writing anything else, it's considered an error. We skip every error unless the token starts with '"', because this signlas we're writing a literal
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
            .map(result => this.typedStringify(result.sugg, result.type)) // show only the entity, properly written based on its type, not its probability (though it may be interesting to have both, even for the user!!)
            .filter((value, index, array) => array.indexOf(value) === index) // distinct elements
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
                    json["results"]["bindings"].map(b => {
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
    getTriplePattern: function(token) {
        // console.log(token)

    },
    isSubject: function(token) {
        return token.state.possibleNext.includes("BIND");
    },
    isPredicate: function(token) {
        // console.log(token);
        return token.state.possibleNext.includes("a");
    },
    isObject: function(previousToken, token) {
        console.log("previous token ", previousToken)
        return previousToken.state.possibleCurrent.includes("a") && !token.state.possibleNext.includes("BIND");
    },
    isGraph: function(previousToken) {
        return "GRAPH" === previousToken.string;
    },
    getAutocompletionQuery: function(yasqe, currentToken) {
        let subject, predicate, object;

        const previousNonWsToken = yasqe.getPreviousNonWsToken(yasqe.getDoc().getCursor().line, currentToken)
        const previousPreviousNonWsToken = previousNonWsToken && yasqe.getPreviousNonWsToken(yasqe.getDoc().getCursor().line, previousNonWsToken)
        const nextNonWsToken = yasqe.getNextNonWsToken(yasqe.getDoc().getCursor().line, yasqe.getDoc().getCursor().ch + 1)
        const nextNextNonWsToken = nextNonWsToken && yasqe.getNextNonWsToken(yasqe.getDoc().getCursor().line, nextNonWsToken.end + 1)

        if(this.isGraph(previousNonWsToken)) {
            return "SELECT * WHERE { GRAPH ?suggestion_variable { ?s ?p ?o. } }"
        }

        if(this.isSubject(currentToken)){
            subject = this.suggestion_variable;
            predicate = (nextNonWsToken && nextNonWsToken.string) || "?predicate_placeholder";
            object = (nextNextNonWsToken && nextNextNonWsToken.string) || "?object_placeholder";
        }

        if(this.isPredicate(currentToken)){
            subject = (previousNonWsToken && previousNonWsToken.string) || "?subject_placeholder";
            predicate = this.suggestion_variable;
            object = (nextNonWsToken && nextNonWsToken.string) || "?object_placeholder";
        }

        if(this.isObject(previousNonWsToken, currentToken)){
            subject = previousPreviousNonWsToken && previousPreviousNonWsToken.string || "?subject_placeholder";
            predicate = (previousNonWsToken && previousNonWsToken.string) || "?predicate_placeholder";
            object = this.suggestion_variable;
        }

        const query = `SELECT * WHERE { ${subject} ${predicate} ${object}. }`

        return query
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
