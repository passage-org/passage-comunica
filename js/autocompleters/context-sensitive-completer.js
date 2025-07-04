import Parser from 'sparqljs';
import ColorHash from 'color-hash';

/// Queries the endpoint to retrieve a few example of values
/// from the current triple pattern being type. This is
/// context-insensitive since it does not take into account the
/// other operations of the SPARQL query.
export const CSCompleter = {
    name: "context-sensitive-completer",
    autoShow: false,
    bulk: false,
    cache: new Object(),
    sugg_var: "suggestion_variable",
    q_sugg_var : "?suggestion_variable",
    proba_var: "probabilityOfRetrievingRestOfMapping",
    q_proba_var: "?probabilityOfRetrievingRestOfMapping",
    colorHash: new ColorHash(), 
    yasqe: null,
    test: null,
    suggestionsBuffer: null,
    get: function(yasqe, token) {
        if(this.suggestionsBuffer) {
            let ret = this.suggestionsBuffer;
            this.suggestionsBuffer = null;
            return ret;
        }

        try {
            return this.get_(yasqe, token);
        }catch(error){
            return [];
        }
    },
    isValidCompletionPosition: function (yasqe) {

        if (!this.yasqe) this.yasqe = yasqe;

        const queryTokens = this.getQueryTokens();
        const index = queryTokens.findIndex(tkn => tkn.isCurrentToken);

        if (queryTokens[index] && queryTokens[index].type === "keyword") return false;

        try {
            const icptp = this.getIncompleteTriple(queryTokens, index);
            this.getACQueryTripleTokens(icptp.entities)
        }catch(error){
            return false;
        }

        return true;
    },
    get_: function(yasqe, token) {

        // console.log(yasqe.getDoc().getCursor().line)
        // console.log(yasqe.getDoc().getCursor().ch)

        this.yasqe = yasqe;


        // console.log("requestConfig", requestConfig)

        let autocompletionQueryString, currentString;

        try {
            let {acqs, cs} = this.getAutocompletionQuery();            
            autocompletionQueryString = acqs;
            currentString = cs;
        }catch(error){
            // console.log(error)
            throw new Error("Could not generate an autocompletion query.");
            // console.error("Could not generate an autocompletion query.")
            // console.log(error);

            // return Promise.resolve([]);
        }

        console.log("Autocompletion Query", autocompletionQueryString);
        console.log(currentString ? `Fitlering with: ${currentString}` : "No filter");

        const requestConfig = yasqe.config.requestConfig();

        const url = requestConfig.endpoint;
        // we assume some kind of endpoint url such as:
        // <protocol>://<authority>/…/<dataset-name>/<passage|sparql>
        // so the dataset becomes suffixed by /raw
        const rawUrl = url.replace(/\/([^\/]+)\/(passage|sparql)$/, "/$1/raw");

        const args = requestConfig.args;

        return Promise.resolve(this.provideSuggestions(rawUrl, args, autocompletionQueryString, currentString));
    },

    // AUTOCOMPLETION DISPLAY 

    postprocessHints: function (_yasqe, hints) {

        const line = _yasqe.getDoc().getCursor().line;
        const ch  = _yasqe.getDoc().getCursor().ch;
        
        const removeProvenanceDisplay = function(e){
            Array.prototype.forEach.call(document.getElementsByClassName("suggestion-detail"), function(node) {
                node.remove();
            }); 
        };

        var x = new MutationObserver(function (e) {
            const hints = document.getElementsByClassName("CodeMirror-hint");
            if (hints.length === 0) removeProvenanceDisplay(null);
        });

        x.observe(document.getElementsByClassName("yasgui").item(0), { childList: true });

        return hints.map(hint => {

            const colorHash = new ColorHash();
        
            hint.render = function(el, self, data){

                // Adjusting where to insert the completed entity, in order to prevent eating characters right before or after. WIP
                const current = _yasqe.getTokenAt({line: line, ch: ch});
                data.from = {line: line, ch: current.string === "." || current.string === "{" ? ch : self.from.ch};
                data.to = {line: line, ch: Math.min(self.to.ch, ch)};

                const suggestionObject = data.displayText;
                const value = suggestionObject.value;
                const score = suggestionObject.score;
                const walks = suggestionObject.walks;
                const finalProvenances = suggestionObject.suggestionVariableProvenances
                      .map(source => source.split("http://").at(2)) // wanky but for now is ok
                      .filter(o => o !== undefined) // when there are no source , filter out
                      .map(source => {console.log(source); return {source: source, hsl: colorHash.hsl(source), hex: colorHash.hex(source)}})
                      .sort((a, b) => a.hsl[0] - b.hsl[0]);

                // We store an object in the displayTextField. Definitely not as intented, but works (...?)

                const suggestionDiv = document.createElement("div");
                suggestionDiv.className = "suggestion-div";

                const suggestionValue = document.createElement("span");
                suggestionValue.className = "suggestion-value"
                suggestionValue.cssFloat = ""
                suggestionValue.textContent = value || "";

                const suggestionScore = document.createElement("span");
                suggestionScore.className = "suggestion-score"
                suggestionScore.textContent = "Estimated cardinality : " + (score || "");
                suggestionScore.style.cssFloat = "";

                const suggestionWalks = document.createElement("span");
                suggestionWalks.className = "suggestion-walks"
                suggestionWalks.textContent = "Random walks : " + (walks || "");
                suggestionWalks.style.cssFloat = "";

                const suggestionProvenance = document.createElement("span");
                suggestionProvenance.className = "suggestion-provenance"
                suggestionProvenance.textContent = finalProvenances ? "Sources : " + (finalProvenances.length ?? "") : "";
                suggestionProvenance.style.cssFloat = "";

                const sourceMarkerSection = document.createElement("section");
                sourceMarkerSection.className = "source-marker-section";
                for(const prov of finalProvenances){
                    const sourceMarker = document.createElement("div");
                    sourceMarker.className = "source-marker";
                    sourceMarker.style.backgroundColor = prov.hex;
                    sourceMarkerSection.appendChild(sourceMarker);
                    sourceMarker.title = prov.source;
                }

                const suggestionProvenanceDetail = document.createElement("ul");
                suggestionProvenanceDetail.className = "suggestion-provenance-detail";
                finalProvenances.forEach(p => {
                    const li = document.createElement("li");
                    li.innerHTML = p.source;
                    suggestionProvenanceDetail.appendChild(li);
                });

                const suggestionDetail = document.createElement("div");
                suggestionDetail.className = "suggestion-detail CodeMirror-hints";

                suggestionDetail.appendChild(suggestionScore);
                suggestionDetail.appendChild(suggestionWalks);
                suggestionDetail.appendChild(suggestionProvenance);
                suggestionDetail.appendChild(suggestionProvenanceDetail);

                suggestionDiv.appendChild(suggestionValue);
                suggestionDiv.appendChild(sourceMarkerSection);
                
                el.appendChild(suggestionDiv);

                const displayProvenanceDetail = function(e){
                    removeProvenanceDisplay(e);
        
                    const yasguiElement = document.getElementsByClassName("yasgui").item(0);

                    const dim = el.getBoundingClientRect();
        
                    suggestionDetail.style.left = (dim.x + dim.width) + "px";
                    suggestionDetail.style.top = (dim.top + window.scrollY) + "px";

                    suggestionDetail.style.width = dim.width;
                    suggestionDetail.style.height = dim.bottom - dim.top;
        
                    yasguiElement.appendChild(suggestionDetail);
                }

                suggestionDiv.onmouseover = displayProvenanceDetail;

                // el.onclick = removeProvenanceDisplay;

                // suggestionDiv.onmouseleave = removeProvenanceDisplay(e);

                data.text = value;
            }
            return hint
        });
    },


    // PROVIDING SUGGESTION DATA 

    provideSuggestions: async function(url, args, autocompletionQueryString, currentString){

        const acqResults = await this.queryWithCache(url, args, autocompletionQueryString, currentString);

        return Promise.resolve(this.processACQResults(acqResults, currentString));
    },


    // AUTOCOMPLETION QUERY RESULTS POST PROCESSING

    processACQResults: async function(acqResults, currentString){

        const prefixes = this.yasqe.getPrefixesFromQuery();
        const filterString = currentString.toLowerCase();

        const successfulWalks = acqResults.filter(mapping => mapping[this.proba_var].value > 0);
        const nbResultsQuery = successfulWalks.length;

        const formatted = this.formatBindings(successfulWalks);
        const filtered = formatted.filter(mappingInfo => this.filterByString(mappingInfo, filterString, prefixes));
        const grouped = this.groupBy(filtered, 'entity', 'value');
        const aggregated = this.aggregate(grouped, nbResultsQuery);

        return aggregated
            // building the item containing the data needed for display
            .map(suggestion => {
                return {
                    value: this.typedStringify(suggestion.value, suggestion.type), 
                    score: Math.round(suggestion.score), 
                    provenances: suggestion.provenances, 
                    walks: suggestion.nbWalks,
                    suggestionVariableProvenances: suggestion.suggestionVariableProvenances}
                }
            ) 
            // Higher up
            .sort((a, b) => b.score - a.score) 
    },

    formatBindings: function(bindings){
        return bindings.map(b => {
            let formatted = {
                suggestionVariableProvenance: "",
                provenances: [],
                probability: 0,
                entity: "",
            };

            for(const [key, val] of Object.entries(b)){
                if(key.includes("provenance")){
                    // Provenance var

                    // For suggestion_variable (= final result provenance)
                    if(key.includes(this.sugg_var)) formatted.suggestionVariableProvenance = val.value;

                    // Update provenances set if needed
                    if(!formatted.provenances.includes(val.value)) formatted.provenances.push(val.value);
                } else

                if(key.includes(this.proba_var)) {
                    formatted.probability = val.value;
                } else 
                
                if(key.includes(this.sugg_var)) formatted.entity = val;
            }

            return formatted;
        })
    },

    filterByString: function(mappingInfo, filterString, prefixes) {

        // TODO: https 
        const isUriStart = function(string){
            return string.startsWith("<") || "http://".includes(string) || string.includes("http://")
        }

        if(filterString === "") return true;

        const toTest = mappingInfo.entity.value.toLowerCase();
        const type = mappingInfo.entity.type;

        if(filterString.startsWith("\"")){
            if(type === "literal" && toTest.includes(filterString.slice(1))) return true;
        }

        // TODO: https 
        if(isUriStart(filterString)){
            if(filterString.includes("<http://"))
                if(toTest.includes(filterString.replace("<http://", ""))) return true;
            else
                if(toTest.includes(currentString)) return true;
        }

        const split = filterString.split(":");
        if(split.length === 1){
            if(toTest.includes(prefixes[split[0]]) || toTest.includes(split[0])) return true;
        }else

        if(split.length === 2){
            if(toTest.includes(prefixes[split[0]]) && toTest.includes(split[1])) return true;
        }

        return false;
    },

    aggregate: function(suggestionGroups, nbResultsQuery){
        
        // We could recompute nbResultsQuerys here, but it would extra and inefficient work, so no thank
        const aggregated = [];

        for(const [key, val] of Object.entries(suggestionGroups)){
            aggregated.push(
                {
                    value : key,
                    type : val[0].entity.type,
                    score : (val.reduce((acc, curr) => {return acc + (curr.probability > 0 ? 1/curr.probability : 0)}, 0.0) / val.length) * (val.length / nbResultsQuery),
                    nbWalks : val.length,

                    // TODO : percentage?
                    provenances : Array.from(new Set(val.map(val => val.provenances).flat())),
                    suggestionVariableProvenances : Array.from(new Set(val.map(val => val.suggestionVariableProvenance))),
                }
            );
        }

        return aggregated;
    },


    // AUTOCOMPLETION QUERY EXECUTION

    queryWithCache: async function(url, args, query, currentString) {

        // console.log("currentString", currentString)

        try {

            if((this.cache[query] && this.cache[query].lastString === currentString) || !this.cache[query]){
                // execute AC query 
                const bindings = await Promise.resolve(this.query(url, args, query));

                // add to the cache if it already exists, otherwise create a new one
                if(this.cache[query])
                    this.cache[query].bindings = this.cache[query].bindings.concat(bindings)
                else
                    this.cache[query] = {bindings: bindings};  

                console.log(`Finished query with ${bindings.length} results`);
                console.log(bindings);

            }

            this.cache[query].lastString = currentString;
            return this.cache[query].bindings;

        } catch (error) {

            throw new Error("Query with cache failed for the following reason:", error);
        }

    },

    query: async function(url, args, query) {
        try {
            const headers = {"Content-Type": "application/x-www-form-urlencoded"}
            const budget = args.find(e => e.name === "budget");
            if (budget) headers["budget"] = budget.value;
            const response = await fetch(url, {
                method: "POST",
                headers: headers,
                body: new URLSearchParams({ "query" : query }),
            });
            
            if (!response.ok) {
                throw new Error(`Response status: ${response.status}`);
            }

            const json = await response.json();
            const bindings = Array.from(
                new Set(
                    json["results"]["bindings"]
                    // .filter(b => b[this.suggestion_variable_name]) // safety measure, in case something goes wrong and bindings don't have mapping for suggestion_variable
                    // .map(b => {
                    //     return {sugg: b[this.suggestion_variable_name]["value"], 
                    //             proba: b[this.proba_var]["value"] || 0,
                    //             type: b[this.suggestion_variable_name]["type"],
                    //         } 
                    //     })
                )
            )

            return bindings
        } catch (error) {
            throw new Error("Query failed : ", error)
        }
    },



    // AUTOCOMPLETION QUERY GENERATION

    getAutocompletionQuery: function() {

        // Generate a complete query, i.e. take the query as is a replace only the current (incomplete) triple by a corresponding complete triple. 

        const tokens = this.getQueryTokens();
        const context = [...tokens];

        const currentTokenIndex = tokens.findIndex(tkn => tkn.isCurrentToken);

        let incompleteTriple; 
        try {
            incompleteTriple = this.getIncompleteTriple(tokens, currentTokenIndex);
        }catch(error){
            throw new Error("Could not retrieve the incomplete triple.")
        }

        // console.log("incompleteTriple", incompleteTriple)

        let acqTriple;
        try {
            acqTriple = this.getACQueryTripleTokens(incompleteTriple.entities);
        }catch(error){
            // console.log(error);
            throw new Error("Could not generate the autocompletion triple.");
        }

        this.current_string = acqTriple.filter ?? "";

        // console.log(acqTriple);

        const endOfTriple = context[incompleteTriple.end + 1];
        const shouldAddPeriod = !endOfTriple || endOfTriple.string !== ".";
        // console.log(endOfTriple);
        // console.log(shouldAddPeriod);

        let variables = incompleteTriple.variables;

        context.splice(
            incompleteTriple.start, 
            incompleteTriple.end - incompleteTriple.start + 1, 
            acqTriple.subject, acqTriple.predicate, acqTriple.object,
            {type:"fake", string: shouldAddPeriod ? "." : ""});


        // console.log(acqTriple);
        // console.log(context);


        // Parse the query as is

        const string = this.getACQPrefixes().concat(context.map(tkn => tkn.string).join(" "));

        var Par = Parser.Parser;
        var parser = new Par();


        try{
            var parsedQuery = parser.parse(string);
        }catch(error){
            const bracketed = this.toParsableQuery(string);
            try{
                var parsedQuery = parser.parse(bracketed);
            }catch(error){
                // console.log(bracketed)
                // console.log(error)
                throw new Error("Could not parse the autcompletion query.")
            }
        }

        console.log(parsedQuery)

        this.removeModifiers(parsedQuery);

        console.log(parsedQuery);

        // Find triples relevant to the context

        const triples = this.getTriples(parsedQuery);
        triples.forEach(t => t.isCurrentTriple = this.getVarsFromParsedTriple(t).includes(this.sugg_var)); // weird way to find the triple being worked on
        triples.forEach(t => t.inContext = t.isCurrentTriple);

        let lastSize = 0;

        while(lastSize !== variables.length){
            lastSize = variables.length;

            // Add all variables linked to the variables of the triple being written.
            // TODO : find more efficient / elegant way to do this
            for(const qt of triples){
                for(const variable of this.getVarsFromParsedTriple(qt)){
                    if(variables.includes(variable)){
                        for(const tpVar of this.getVarsFromParsedTriple(qt)){
                            if(!variables.includes(tpVar)){
                                variables.push(tpVar);
                            }
                        }
                        qt.inContext = true;
                        break;
                    }
                }
            }
        }


        // Remove parts of the query outside of context

        this.markRelevantNodes(parsedQuery);
        const trimmed = this.trim(parsedQuery);

        
        // Generate the AC query string 
        parsedQuery.variables = [{termType: "Wildcard", value: "*"}];

        // console.log("parsed", parsedQuery);
        parsedQuery.prefixes = this.yasqe.getPrefixesFromQuery();

        var Gen = Parser.Generator;
        var generator = new Gen();
        var AutocompletionQueryString = generator.stringify(trimmed);

        // console.log("currentString2", acqTriple.filter ?? "")

        return {acqs: AutocompletionQueryString, cs: acqTriple.filter ?? ""};
    },


    getACQPrefixes: function(){
        const prefixes = this.yasqe.getPrefixesFromQuery();
        const prefixStrings = [];

        for (const [key, value] of Object.entries(prefixes)){
            prefixStrings.push(`PREFIX ${key}: <${value}>`);
        }

        return prefixStrings.join(" ");
    },
    


    toParsableQuery: function(queryString){
        const nbBracketsOpen = (queryString.match(/{/g) || []).length;
        const nbBracketsClosed = (queryString.match(/}/g) || []).length;

        // closing all open brackets

        for(let i = 0; i < nbBracketsOpen - nbBracketsClosed; i++){
            queryString += "}";
        }

        return queryString;
    },


    // INCOMPLETE (= TO BE AUTCOMPLETED) TRIPLE

    getIncompleteTriple: function(tokenArray, index){
        const before = this.getTripleBefore(tokenArray, index);
        const after = this.getTripleAfter(tokenArray, index + 1);

        let tripleTokens = before.concat(after);
        tripleTokens = this.removeWhiteSpacetokens(tripleTokens);

        const entities = this.getTokenGroupsOfTriple(tripleTokens);

        // console.log("entities", entities);

        if(entities.length > 3) throw new Error("Not a triple");

        const start = index - (before.length - 1);
        const end = start + before.length + after.length - 1;

        // console.log("before", before)
        // console.log("after", after)
        // console.log("tokenArray", tokenArray)
        // console.log("index", index)
        // console.log("start", start)
        // console.log("end", end)

        return {
            start: start,
            end: end,
            tokens: tripleTokens,
            entities: entities,
            type: "triple",
            incomplete: true,
            variables: tripleTokens.filter(elt => elt.type === "atom").map(elt => elt.string.replace("?","")),
        }
    },


    getACQueryTripleTokens: function(entities){
        const line = this.yasqe.getDoc().getCursor().line;
        const ch = this.yasqe.getDoc().getCursor().ch;

        let subject = "?default_s";
        let predicate = "?default_p";
        let object = "?default_o";
        let filter = "";

        if(entities.length === 3){

            // console.log(entities)

            const currentToken = entities.flat().find(tkn => tkn.isCurrentToken);
            const idx = entities.findIndex(entity => entity.find(tkn => tkn == currentToken));

            if(idx === -1 &&
                ["variable-3", // uri
                "atom", // variable
                "error", // possible first unfinished string of entity like pre:id
                "number", // number
                "string"] // literal
                .includes(currentToken.type)
            ) {
                throw new Error("Subject, Predicate and Object found. Triple already written.");
            }
            
            // console.log("idx", idx);
            // const incompleteUriIndex = entities.findIndex(entity => entity.find(tkn => tkn.type === "incomplete-uri"));
            
            // TODO : verify this condition. Should a period, semicolon, etc. also throw ?
            // if (currentToken.type === "ws") 

            // console.log("incompleteUriIndex", incompleteUriIndex)
            switch (idx) {
                case 0:
                    subject = this.q_sugg_var;
                    predicate = this.stringifyTokenGroup(entities[1]);
                    object = this.stringifyTokenGroup(entities[2]);
                    break;

                case 1:
                    subject = this.stringifyTokenGroup(entities[0]);
                    predicate = this.q_sugg_var;
                    object = this.stringifyTokenGroup(entities[2]);
                    break;

                case 2:
                    subject = this.stringifyTokenGroup(entities[0]);
                    predicate = this.stringifyTokenGroup(entities[1]);
                    object = this.q_sugg_var;
                    break;
            
                default:
                    throw new Error(`Triple to complete has 3 entities, but the index of the incomplete entity is incorrect : ${incompleteUriIndex} `);
            }

            filter = entities[idx].map(tkn => tkn.string).join("");
        } 

        // console.log(entities);

        if(entities.length === 0) {
            subject = this.q_sugg_var;
            predicate = "?predicate_placeholder";
            object = "?object_placeholder";
        }

        if(entities.length === 1) {
            
            if(this.isPosBeforeToken(line, ch, entities[0][0])){
                // console.log("before")
                // x [[entity]]
                subject = this.q_sugg_var;
                predicate = "?predicate_placeholder";
                object = this.stringifyTokenGroup(entities[0]);
            }

            if(this.isPosAfterToken(line, ch, entities[0].at(-1))){
                // console.log("after")
                // [[entity]] x
                subject = this.stringifyTokenGroup(entities[0]);
                predicate = this.q_sugg_var;
                object = "?object_placeholder";
            }
        }

        if(entities.length === 2) {

            if(this.isPosBeforeToken(line, ch, entities[0][0])){
                // x [[entity]] [[entity]]
                subject = this.q_sugg_var;
                predicate = this.stringifyTokenGroup(entities[0]);
                object = this.stringifyTokenGroup(entities[1]);
            }

            if(this.isPosBeforeToken(line, ch, entities[1][0]) 
                && this.isPosAfterToken(line, ch, entities[0].at(-1))){
                // [[entity]] x [[entity]]
                subject = this.stringifyTokenGroup(entities[0]);
                predicate = this.q_sugg_var;
                object = this.stringifyTokenGroup(entities[1]);
            }

            if(this.isPosAfterToken(line, ch, entities[1].at(-1))){
                // [[entity]] [[entity]] x
                subject = this.stringifyTokenGroup(entities[0]);
                predicate = this.stringifyTokenGroup(entities[1]);
                object = this.q_sugg_var;
            }


            // one finished entity and another being typed
            // if(this.isPosJustBeforeToken(line, ch, entities[0][0])){
            //     // x[[entity]] [[entity]]
            //     subject = this.suggestion_variable;
            //     predicate = this.stringifyTokenGroup(entities[0]);
            //     object = this.stringifyTokenGroup(entities[1]);
            // }

            if(this.isPosJustAfterToken(line, ch, entities[0].at(-1))){
                // [[entity]]x [[entity]]
                subject = this.q_sugg_var;
                predicate = this.stringifyTokenGroup(entities[1]);
                object = "?object_placeholder";

                // filter = `FILTER REGEX (${this.suggestion_variable}, \"^${entities[0].map(tkn => tkn.string).join("").slice(1, -1)}\")`;
                filter = entities[0].map(tkn => tkn.string).join("");
            }

            // if(this.isPosJustBeforeToken(line, ch, entities[1][0])){
            //     // [[entity]] x[[entity]]
            //     subject = this.stringifyTokenGroup(entities[0]);
            //     predicate = this.suggestion_variable;
            //     object = "?o";

            //     filter = `FILTER REGEX (${this.suggestion_variable}, \"^${entities[1].map(tkn => tkn.string).join("").slice(1, -1)}\")`;
            // }

            if(this.isPosJustAfterToken(line, ch, entities[1].at(-1))){
                // [[entity]] [[entity]]x
                subject = this.stringifyTokenGroup(entities[0]);
                predicate = this.q_sugg_var;
                object = "?object_placeholder";

                // filter = `FILTER REGEX (${this.suggestion_variable}, \"^${entities[1].map(tkn => tkn.string).join("").slice(1, -1)}\")`;
                filter = entities[1].map(tkn => tkn.string).join("");
            }
        }

        return {
            subject: {string: subject, type: "fake"}, 
            predicate: {string: predicate, type: "fake"}, 
            object: {string: object, type: "fake"},
            filter: filter,
        };
    },

    // getTriple: function(tokenArray, index){
    //     const before = this.getTripleBefore(tokenArray, index);
    //     const after = this.getTripleAfter(tokenArray, index + 1);

    //     const tripleTokens = before.concat(after);

    //     const entities = this.getTokenGroupsOfTriple(tripleTokens);

    //     if(entities.length === 0 || entities.length > 3) throw new Error("Not a triple");
        
    //     return {
    //         start: index - before.length,
    //         end: index + after.length,
    //         subject: this.stringifyTokenGroup(entities[0]),
    //         predicate: this.stringifyTokenGroup(entities[1]),
    //         object: this.stringifyTokenGroup(entities[2]),
    //         tokens: tripleTokens,
    //         type: "triple",
    //         incomplete: true,
    //         variables: tripleTokens.filter(elt => elt.type === "atom").map(elt => elt.string.replace("?","")),
    //     };
    // },

    getTokenGroupsOfTriple: function(tokenArray) {
        const entities = [];
        let idx = 0;
        let probe;

        while(tokenArray[idx]) {
            let token = tokenArray[idx];

            switch (token.type) {
                case "variable-3": // uri
                case "string-2": // blank node or prefix:entity
                case "atom": // variable
                case "error": // possible first unfinished string of entity like pre:id
                    entities.push([token]);
                    break;
                case "number": // number
                case "string": // literal
                    probe = idx + 1;
                    if(tokenArray[probe]){
                        if(tokenArray[probe].type === "meta" && tokenArray[probe].string.startsWith("@")){
                            // string@en

                            entities.push([token, tokenArray[probe]]);
                            idx = probe;
                        }else 
                        if(tokenArray[probe].type === "punc" && tokenArray[probe].string === ("^^")){
                            if(tokenArray[probe + 1]){
                                if(tokenArray[probe + 1].type === "variable-3"){
                                    // string^^<datatype>

                                    entities.push([token, tokenArray[probe], tokenArray[probe + 1]]);
                                    idx = probe + 1;
                                }
                            }else{
                                // string

                                entities.push([token]);
                            }
                        }else {
                            entities.push([token]);
                        }
                    } 
                    break;

                case "punc":
                    if(token.string === "." 
                    || token.string === ";"
                    || token.string === ","
                    || token.string === "}") break;

                    // incomplete uri
                    if(token.string === "<"){
                        probe = idx + 1;
                        let last = token;
                        let current = tokenArray[probe];
                        while(probe < tokenArray.length && tokenArray[probe] && !last.isCurrentToken){
                            probe++;
                            last = current;
                            current = tokenArray[probe];
                        }

                        const tokens = tokenArray.slice(idx, probe);
                        const string = this.stringifyTokenGroup(tokens);

                        entities.push([{
                            type: "incomplete-uri", 
                            string: string,
                            start: tokens.at(0).start,
                            end: tokens.at(-1).end,
                            isCurrentToken: (tokens.findIndex(tkn=>tkn.isCurrentToken) !== -1)
                        }]);

                        // console.log("entities rn", entities);

                        idx = probe - 1; 
                        // -1 because we had to probe the token after the end of the unfinished uri, to know where it ends.
                        // So if we set the idx to the probe, and then increment at the end of while loop, we are gonna skip the next token. 

                        break;
                    }
                    
                    return [];
                
                case "ws":
                    break;

                default:
                    return [];
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

        // TODO: do the same for literals
        const startOfUnfinishedUri = this.getStartOfUnfinishedUri(tokenArray, index);
        if (startOfUnfinishedUri !== -1) {
            return this.getTripleBefore_(tokenArray, startOfUnfinishedUri - 1).concat(tokenArray.slice(startOfUnfinishedUri, index + 1));
        }

        switch (current.type) {
            case "atom":// variable
            case "variable-3": // uri
            case "string": // literal
            case "string-2": // blank node or prefix:entity
            case "number": // number
                return this.getTripleBefore_(tokenArray, index - 1).concat([current]);

            case "ws":
                if(current.isCurrentToken) return this.getTripleBefore_(tokenArray, index - 1).concat([current]);
                return this.getTripleBefore_(tokenArray, index - 1);

            case "punc": // ^^
                if(current.string === "^^") return this.getTripleBefore_(tokenArray, index - 1).concat([current]);
                break;

            case "meta": // @
                if(current.string.startsWith("@")) return this.getTripleBefore_(tokenArray, index - 1).concat([current]);
                break;
            
            case "error": // possible first unfinished string of entity like pre:id
                return this.getTripleBefore_(tokenArray, index - 1).concat([current]);

            default:
                break;
        }

        return [];
    },


    getTripleAfter: function(tokenArray, index){
        if (tokenArray[index] && tokenArray[index].type === "punc"){
            switch (tokenArray[index].string) {
                case ".":
                case ",":
                case ";":
                    return [tokenArray[index]];
                case "}":
                case "{":
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
            case "string-2": // blank node or prefix:entity
            case "number": // number
                return [current].concat(this.getTripleAfter_(tokenArray, index + 1));

            case "ws":
                // if(current.isCurrentToken) return this.getTripleAfter_(tokenArray, index + 1).concat([current]);
                return this.getTripleAfter_(tokenArray, index + 1);

            case "punc": // ^^
                if(current.string === "^^") return [current].concat(this.getTripleAfter_(tokenArray, index + 1));
                if(current.string === "." 
                || current.string === ";"
                || current.string === ",") return [current];
                if(current.string === "{"
                || current.string === "}") return [];

            case "meta": // @
                if(current.string.startsWith("@")) return [current].concat(this.getTripleAfter_(tokenArray, index + 1));
            
            case "error": // possible first unfinished string of entity like pre:id
                return this.getTripleBefore_(tokenArray, index + 1).concat([current]);

            default:
                if(current.string === "." 
                || current.string === ";"
                || current.string === ",") return [current];
                return [];
        }
    },

    getQueryTokens: function() {
        const line = this.yasqe.getDoc().getCursor().line;
        const ch = this.yasqe.getDoc().getCursor().ch;

        const nbLines = this.yasqe.getDoc().size; //number of lines
        let tokenArray = [];

        for(let i = 0; i < nbLines; i++){
            const lineTokens = this.yasqe.getLineTokens(i);

            lineTokens.forEach(tkn => tkn.line = i);

            // mark the current token in the array
            if(line === i){

                // somewhat convoluted way to go about it, but this allow to make sure we only tag ONE token as the current token, and that it's the proper one
                let current = this.yasqe.getTokenAt({line: line, ch: ch});

                lineTokens.forEach(tkn => {
                    if(tkn.start === current.start && tkn.end === current.end){
                        tkn.isCurrentToken = true
                    }
                });
            }

            tokenArray = tokenArray.concat(lineTokens);
        }

        tokenArray = tokenArray.filter(tkn => tkn.type != "ws" || tkn.isCurrentToken);

        while(tokenArray[0].string.toLowerCase() !== "select") tokenArray.shift(); // Remove everything until the first bracket (after the WHERE)

        return tokenArray;
    },

    removeModifiers: function(parsedQueryTree){
        switch(parsedQueryTree.type){
            case "query":
                parsedQueryTree.distinct = false;
                parsedQueryTree.offset = 0;
                delete parsedQueryTree.limit;
                delete parsedQueryTree.group;
                delete parsedQueryTree.order;
            case "query":
            case "union":
            case "group":
            case "graph":
            case "optional":
            case "bgp":
            case "filter":
            default :
                {};
        }
    },

    trim: function(parsedQueryTree){
        switch(parsedQueryTree.type){
            case "query":
                parsedQueryTree.where = parsedQueryTree.where.filter(
                    w => w.inContext
                )
                .map(w => this.trim(w))
                .flat();

                return parsedQueryTree
        
            case "union":
            case "group":
                parsedQueryTree.patterns = parsedQueryTree.patterns.filter(
                    p => p.inContext
                )
                .map(p => this.trim(p))
                .flat();

                if(parsedQueryTree.patterns.length === 1) return [parsedQueryTree.patterns[0]];

                return [parsedQueryTree]
            
            case "graph":
                parsedQueryTree.patterns = parsedQueryTree.patterns.filter(
                    p => p.inContext
                )
                .map(p => this.trim(p)) 
                .flat();

                return [parsedQueryTree]

            case "optional": 
                parsedQueryTree.patterns = parsedQueryTree.patterns.filter(
                    p => p.inContext
                )
                .map(p => this.trim(p)) 
                .flat();

                // console.log([...parsedQueryTree.patterns]);

                if(parsedQueryTree.patterns.length === 0) return [];

                if(this.hasCurrentTriple(parsedQueryTree)) return [...parsedQueryTree.patterns];

                return [parsedQueryTree]

            case "bgp":
                parsedQueryTree.triples = parsedQueryTree.triples.filter(
                    t => t.inContext
                )
                .map(t => this.trim(t))
                .flat()

                if(parsedQueryTree.triples.length === 1) return [parsedQueryTree.triples[0]];

                return [parsedQueryTree];
            
            case "filter":
                return parsedQueryTree;
            
            default : // triple
                return [parsedQueryTree];
        }
    },

    getVarsFromParsedTriple: function(triple){
        let vars = [];

        triple.subject.termType === "Variable" ? vars.push(triple.subject.value) : {};
        triple.predicate.termType === "Variable" ? vars.push(triple.predicate.value) : {} ;
        triple.object.termType === "Variable" ? vars.push(triple.object.value) : {} ;

        return vars;
    },

    getTriples: function(parsedQueryTree){
        switch(parsedQueryTree.type){
            case "query":
                return parsedQueryTree.where.reduce(
                        (acc, val) => acc.concat(this.getTriples(val)),
                        []  
                    ); 
            
            case "graph":
            case "union":
            case "group":
                return parsedQueryTree.patterns.reduce(
                    (acc, val) => acc.concat(this.getTriples(val)),
                    []  
                ); 

            case "bgp":
                return parsedQueryTree.triples;
            
            case "optional":
                return parsedQueryTree.patterns.reduce(
                    (acc, val) => acc.concat(this.getTriples(val)),
                    []  
                ); 

            case "filter":
                return [];
            
            default : // triple
                return [parsedQueryTree];
        }
    },

    markRelevantNodes: function(parsedQueryTree){
        switch(parsedQueryTree.type){
            case "query":
                parsedQueryTree.inContext = true;
                parsedQueryTree.where.forEach(
                    w => this.markRelevantNodes(w)
                )
                break;
            
            case "graph":
            case "group":
            case "optional":
            
                parsedQueryTree.inContext = true;
                parsedQueryTree.patterns.forEach(
                    c => this.markRelevantNodes(c)
                ) 
                break;

            case "union":
                parsedQueryTree.inContext = true;
                if(this.hasCurrentTriple(parsedQueryTree.patterns[0])){
                    this.markRelevantNodes(parsedQueryTree.patterns[0])
                    parsedQueryTree.patterns[1].inContext = false;
                }else
                if(this.hasCurrentTriple(parsedQueryTree.patterns[1])){
                    parsedQueryTree.patterns[0].inContext = false;
                    this.markRelevantNodes(parsedQueryTree.patterns[1])
                }else {
                    this.markRelevantNodes(parsedQueryTree.patterns[0])
                    this.markRelevantNodes(parsedQueryTree.patterns[1])
                }
                break;

            case "bgp":
                parsedQueryTree.inContext = true;
                parsedQueryTree.triples.forEach(
                    c => this.markRelevantNodes(c)
                )
                break;
            
            case "filter":
                parsedQueryTree.inContext = true;

            default : // triple
                {} // nothing to do;
        }
    },

    hasCurrentTriple: function(parsedQueryTree){
        switch(parsedQueryTree.type){
            case "query":
                return parsedQueryTree.where.reduce(
                        (acc, val) => acc || this.hasCurrentTriple(val),
                        false  
                    ); 
            
            case "graph":
            case "union":
            case "group":
            case "optional":
                return parsedQueryTree.patterns.reduce(
                    (acc, val) => acc || this.hasCurrentTriple(val),
                    false  
                ); 

            case "bgp":
                return parsedQueryTree.triples.reduce(
                    (acc, val) => acc || this.hasCurrentTriple(val),
                    false  
                ); 
            
            case "filter":
                return false;
            
            default : // triple
                return parsedQueryTree.isCurrentTriple;
        }
    },

    // UTILS

    getClosestCharBefore: function(tokenArray, index, char){
        while(index >= 0 && tokenArray[index] && tokenArray[index].string !== char){
            index--;
        }

        if(tokenArray[index] && tokenArray[index].string === char){
            return index;
        }

        return -1;
    },

    getClosestCharAfter: function(tokenArray, index, char){
        while(index < tokenArray.length && tokenArray[index] && tokenArray[index].string !== char){
            index++;
        }

        if(tokenArray[index] && tokenArray[index].string === char){
            return index;
        }

        return -1;
    },

    getClosestTokenTypeBefore: function(tokenArray, index, type){
        while(index >= 0 && tokenArray[index] && tokenArray[index].type !== type){
            index--;
        }

        if(tokenArray[index] && tokenArray[index].type === type){
            return index;
        }

        return -1;
    },

    getClosestTokenTypeAfter: function(tokenArray, index, type){
        while(index < tokenArray.length && tokenArray[index] && tokenArray[index].type !== type){
            index++;
        }

        if(tokenArray[index] && tokenArray[index].type === type){
            return index;
        }

        return -1;
    },

    getStartOfUnfinishedUri: function(tokenArray, index){

        const closestLessThanIndexBefore = this.getClosestCharBefore(tokenArray, index, "<");
        const closestGreaterThanIndexBefore = this.getClosestCharBefore(tokenArray, index, ">");
        const closestLessThanIndexAfter = this.getClosestCharAfter(tokenArray, index, "<");
        const closestGreaterThanIndexAfter = this.getClosestCharAfter(tokenArray, index, ">");

    
        if(closestGreaterThanIndexBefore < closestLessThanIndexBefore 
            && (closestLessThanIndexAfter < closestGreaterThanIndexAfter 
                || closestGreaterThanIndexAfter === -1)){

                    return closestLessThanIndexBefore;
        }

        return -1;
    },

    stringifyTokenGroup: function(tokenArray){
        const strings = [];
        tokenArray.forEach(token => {
            strings.push(token.string)
        });
        return strings.join("");
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
            case 'uri':
                for(const [key, val] of Object.entries(this.yasqe.getPrefixesFromQuery())){
                    if(entity.includes(val)) {
                        return entity.replace(val, key+":")
                    }
                }

                return "<" + entity + ">"
            case 'literal':
                return "\"" + entity + "\""
            default:
                return "UNKNOWN TYPE : " + entity
        }
    },

    removeWhiteSpacetokens: function(tokenArray){
        return tokenArray.filter(tkn => tkn.type != "ws");
    },

    groupBy: function(xs, key, subKey) {
        return xs.reduce(function(rv, x) {

            (rv[x[key][subKey] ?? x[key]] ??= []).push(x);
            return rv;
        }, {});
    }
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


/* PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>

SELECT ?s ?l ?probabilityOfRetrievingRestOfMapping WHERE {
  
  ?s rdf:type ?t.
  {
    ?s rdfs:label ?l
  }UNION{ 
    ?s owl:sameAs ?sa
  }
} */



//   PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
//   PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
//   PREFIX owl: <http://www.w3.org/2002/07/owl#>
//   PREFIX bsbm: <http://www4.wiwiss.fu-berlin.de/bizer/bsbm/v01/vocabulary/>
  
//   SELECT * WHERE {
//     ?s bsbm:productFeature <http://www.ratingsite18.fr/ProductFeature17447>.
//     ?s rdf:type ?o.
//     ?s owl:sameAs ?sa.
//     ?z owl:sameAs ?sa.
//     ?z 
//   }