import Parser from 'sparqljs';
import { results_processing } from '../context-sensitive-completer-modules/results-processing'
import { parsed_operations } from '../context-sensitive-completer-modules/parsed-operations';
import { display_suggestions } from '../context-sensitive-completer-modules/display-suggestions';
import { constants, NotHandledError } from '../context-sensitive-completer-modules/constants';
import { YasguiConfig } from '../yasgui-config';

/// Queries the endpoint to retrieve a few example of values
/// from the current triple pattern being type. This is
/// context-insensitive since it does not take into account the
/// other operations of the SPARQL query.
export const CSCompleter = {
    name: "context-sensitive-completer",
    lang : navigator.language,
    cache: new Object(),
    yasqe: null,
    autoShow: false,
    bulk: false,

    get: function(yasqe, token) {
        display_suggestions.autocompleteStartFeedback();
        return this.get_(yasqe, token)
            .then((hints) => {
                display_suggestions.autocompleteEndFeedback(hints);
                return hints;
            })
            .catch((e) => {
                display_suggestions.autocompleteEndFeedback([]);
                return [];
            });
    },

    isValidCompletionPosition: function (yasqe) {

        if (!this.yasqe) this.yasqe = yasqe;
        if (!results_processing.yasqe) results_processing.yasqe = yasqe;

        const queryTokens = this.getQueryTokens();
        const index = queryTokens.findIndex(tkn => tkn.isCurrentToken);

        if (queryTokens[index] && queryTokens[index].type === "keyword") return false;

        try {
            const icptp = this.getIncompleteTriple(queryTokens, index);
            this.getACQueryTripleTokens(icptp.entities);
        }catch(error){
            return false;
        }

        return true;
    },

    get_: async function(yasqe, token) {
        
        this.yasqe = yasqe;
        let autocompletionQueryString, currentString;

        try {
            let {acqs, cs} = this.getAutocompletionQuery();
            autocompletionQueryString = acqs;
            currentString = cs;
        }catch(error){
            throw new Error("Could not generate an autocompletion query");
        }

        console.log("Autocompletion Query", autocompletionQueryString);
        console.log(currentString ? `Filtering with: ${currentString}` : "No filter");

        const requestConfig = yasqe.config.requestConfig();

        const url = requestConfig.endpoint;
        // we assume some kind of endpoint url such as:
        // <protocol>://<authority>/…/<dataset-name>/<passage|sparql>
        // so the dataset becomes suffixed by /raw
        const rawUrl = url.replace(/\/([^\/]+)\/(passage|sparql)(\?default-graph-uri=.*)?$/, "/$1/raw$3");

        const args = requestConfig.args;

        return await this.provideSuggestions(rawUrl, args, autocompletionQueryString, currentString);
    },



    postprocessHints: function (_yasqe, hints) {

        const _colorHash = constants.colorHash;

        const removeProvenanceDisplay = function(e){
            Array.prototype.forEach.call(document.getElementsByClassName("suggestion-detail"), function(node) {
                node.remove();
            }); 
        };

        const updatePrefixes = function(e){
            // matches more than it should (like "https:" from URIs), but we never add a prefix that's not amongst the list
            // of predefined prefixes so it's never an issue.
            const regex = /[a-zA-Z]*\:/g;
            const matches = _yasqe.getValue().match(regex);

            const existingPrefixes = _yasqe.getPrefixesFromQuery();
            const hiddenPrefixes = YasguiConfig.yasr.prefixes;

            const existingPrefixLabels = Object.keys(existingPrefixes);
            const hiddenPrefixLabels = Object.keys(hiddenPrefixes);

            matches.forEach(match => {
                const label = match.slice(0, -1);

                if(!existingPrefixLabels.includes(label) && hiddenPrefixLabels.includes(label)) {
                    var prefixObj = {[label]: hiddenPrefixes[label]};
                    _yasqe.addPrefixes(prefixObj);
                }
            });
        }

        var x = new MutationObserver(function (e) {
            const hints = document.getElementsByClassName("CodeMirror-hint");
            if (hints.length === 0) {
                removeProvenanceDisplay(null);
                updatePrefixes(e);
            };
        });

        x.observe(document.getElementsByClassName("yasgui").item(0), { childList: true });

        const renderableHints = hints.map(hint => {

            hint.render = display_suggestions.getRenderHint(_yasqe, _colorHash, removeProvenanceDisplay);

            return hint;
        });
        
        return renderableHints;
    },


    // PROVIDING SUGGESTION DATA 

    provideSuggestions: async function(url, args, autocompletionQueryString, currentString){

        const acqResults = await this.queryWithCache(url, args, autocompletionQueryString, currentString);

        const prefixes = this.mergePrefixesFromQueryAndConfig(this.yasqe.getPrefixesFromQuery(), YasguiConfig.yasr.prefixes)

        return results_processing.processACQResults(acqResults, currentString, this.lang, prefixes);
    },


    // AUTOCOMPLETION QUERY EXECUTION

    queryWithCache: async function(url, args, query, currentString) {

        if((this.cache[query] && this.cache[query].lastString === currentString) || !this.cache[query]){
            // execute AC query 
            const bindings = await this.query(url, args, query);

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
    },

    createURLSearchParams: function(args, query){
        const urlsp = new URLSearchParams({ "query" : query });

        const getHeaderAndAddToSearchParams = function(header){
            const value = args.find(e => e.name === header);
            if(value) urlsp.set(header, value.value);
        }

        constants.headers.forEach(header => {
            getHeaderAndAddToSearchParams(header);
        });

        return urlsp;
    },

    query: async function(url, args, query) {
        try {
            const urlsp = this.createURLSearchParams(args, query);

            const start = Date.now();

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: urlsp
            });

            const end = Date.now();

            const time = end - start;
            const parsed = this.msToTime(time);

            console.log(`Got a response in ${parsed}`);

            if (!response.ok) {
                throw new Error(`Response status: ${response.status}`);
            }

            const json = await response.json();
            const bindings = json["results"]["bindings"];

            return bindings
        } catch (error) {
            throw new Error("Query failed : ", error)
        }
    },



    // AUTOCOMPLETION QUERY GENERATION

    getAutocompletionQuery: function() {

        // Generate a complete query, i.e. take the query as is and replace only the current (incomplete) triple by a corresponding complete triple. 

        const tokens = this.getQueryTokens();
        const context = [...tokens];

        const currentTokenIndex = tokens.findIndex(tkn => tkn.isCurrentToken);

        let incompleteTriple; 
        try {
            incompleteTriple = this.getIncompleteTriple(tokens, currentTokenIndex);
        }catch(error){
            throw new Error("Could not retrieve the incomplete triple.")
        }

        let acqTriple;
        try {
            acqTriple = this.getACQueryTripleTokens(incompleteTriple.entities);
        }catch(error){
            // console.log(error);
            throw new Error("Could not generate the autocompletion triple.");
        }

        this.current_string = acqTriple.filter ?? "";

        const endOfTriple = context[incompleteTriple.end + 1];
        const shouldAddPeriod = !endOfTriple || endOfTriple.string !== ".";

        context.splice(
            incompleteTriple.start, 
            incompleteTriple.end - incompleteTriple.start + 1, 
            acqTriple.subject, acqTriple.predicate, acqTriple.object,
            {type:"fake", string: shouldAddPeriod ? "." : ""}, 
            acqTriple.label_optional);


        // Parse the query as is (without the comments)

        const commentless = context.filter(tkn => tkn.type !== "comment");
        const string = this.getACQPrefixes().concat(commentless.map(tkn => tkn.string).join(" "));

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
                console.log(error)
                throw new Error("Could not parse the autcompletion query.")
            }
        }

        var trimmed;
        try {
            parsed_operations.removeModifiers(parsedQuery);

            // Find triples relevant to the context

            const triples = parsed_operations.getTriples(parsedQuery);
            const filters = parsed_operations.getFilters(parsedQuery);

            triples.forEach(t => {
                t.isCurrentTriple = parsed_operations.getVarsFromParsedTriple(t).includes(constants.sugg_var); // weird way to find the triple being worked on
                t.inContext = t.isCurrentTriple;
            }); 

            filters.forEach(f => f.inContext = false);

            let variables = incompleteTriple.variables;

            parsed_operations.markTriplesAndFilters(triples, filters, variables);

            // Remove parts of the query outside of context

            parsed_operations.markRelevantNodes(parsedQuery);
            trimmed = parsed_operations.trim(parsedQuery);
        } catch (error) {
            if(error instanceof NotHandledError) console.log(error.type + " is not handled");
            throw new Error("Couldn't handle parsed query");
        }

        
        // Generate the AC query string 
        parsedQuery.variables = [{termType: "Wildcard", value: "*"}];

        parsedQuery.prefixes = this.mergePrefixesFromQueryAndConfig(this.yasqe.getPrefixesFromQuery(), YasguiConfig.yasr.prefixes);

        var Gen = Parser.Generator;
        var generator = new Gen();
        var AutocompletionQueryString = generator.stringify(trimmed);

        return {acqs: AutocompletionQueryString, cs: acqTriple.filter ?? ""};
    },


    getACQPrefixes: function(){
        const prefixes = this.mergePrefixesFromQueryAndConfig(this.yasqe.getPrefixesFromQuery(), YasguiConfig.yasr.prefixes);
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

        if(entities.length > 3) throw new Error("Not a triple");

        const start = index - (before.length - 1);
        const end = start + before.length + after.length - 1;

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

        const currentToken = entities.flat().find(tkn => tkn.isCurrentToken);
        const idx = entities.findIndex(entity => entity.find(tkn => tkn == currentToken));

        const filter = idx !== -1 ? entities[idx].map(tkn => tkn.string).join("") : "";

        if(entities.length === 0) {
            subject = constants.q_sugg_var;
            predicate = "?predicate_placeholder";
            object = "?object_placeholder";
        }

        if(entities.length === 1) {

            if(this.isPosJustAfterToken(line, ch, entities[0][0])){
                // [[entity]]x
                subject = constants.q_sugg_var;
                predicate = "?predicate_placeholder";
                object = "?object_placeholder";
            }
            
            if(this.isPosBeforeToken(line, ch, entities[0][0])){
                // x [[entity]]
                subject = constants.q_sugg_var;
                predicate = "?predicate_placeholder";
                object = this.stringifyTokenGroup(entities[0]);
            }

            if(this.isPosAfterToken(line, ch, entities[0].at(-1))){
                // [[entity]] x
                subject = this.stringifyTokenGroup(entities[0]);
                predicate = constants.q_sugg_var;
                object = "?object_placeholder";
            }
        }

        if(entities.length === 2) {

            if(this.isPosBeforeToken(line, ch, entities[0][0])){
                // x [[entity]] [[entity]]
                subject = constants.q_sugg_var;
                predicate = this.stringifyTokenGroup(entities[0]);
                object = this.stringifyTokenGroup(entities[1]);
            }

            if(this.isPosBeforeToken(line, ch, entities[1][0]) 
                && this.isPosAfterToken(line, ch, entities[0].at(-1))){
                // [[entity]] x [[entity]]
                subject = this.stringifyTokenGroup(entities[0]);
                predicate = constants.q_sugg_var;
                object = this.stringifyTokenGroup(entities[1]);
            }

            if(this.isPosAfterToken(line, ch, entities[1].at(-1))){
                // [[entity]] [[entity]] x
                subject = this.stringifyTokenGroup(entities[0]);
                predicate = this.stringifyTokenGroup(entities[1]);
                object = constants.q_sugg_var;
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
                subject = constants.q_sugg_var;
                predicate = this.stringifyTokenGroup(entities[1]);
                object = "?object_placeholder";
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
                predicate = constants.q_sugg_var;
                object = "?object_placeholder";
            }
        }

        if(entities.length === 3){

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
            
            switch (idx) {
                case 0:
                    subject = constants.q_sugg_var;
                    predicate = this.stringifyTokenGroup(entities[1]);
                    object = this.stringifyTokenGroup(entities[2]);
                    break;

                case 1:
                    subject = this.stringifyTokenGroup(entities[0]);
                    predicate = constants.q_sugg_var;
                    object = this.stringifyTokenGroup(entities[2]);
                    break;

                case 2:
                    subject = this.stringifyTokenGroup(entities[0]);
                    predicate = this.stringifyTokenGroup(entities[1]);
                    object = constants.q_sugg_var;
                    break;
            
                default:
                    throw new Error(`Triple to complete has 3 entities, but the index of the incomplete entity is incorrect : ${incompleteUriIndex} `);
            }

        }

        return {
            subject: {string: subject, type: "fake"}, 
            predicate: {string: predicate, type: "fake"}, 
            object: {string: object, type: "fake"},
            label_optional: {string: constants.label_optional, type: "fake"},
            filter: filter,
        };
    },

    getTokenGroupsOfTriple: function(tokenArray) {
        const entities = [];
        let idx = 0;
        let probe;

        while(tokenArray[idx]) {
            let token = tokenArray[idx];

            switch (token.type) {
                case "meta": // language tag or such
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

        while(tokenArray[0] && tokenArray[0].string.toLowerCase() !== "select") tokenArray.shift(); // Remove everything until the first bracket (after the WHERE)

        return tokenArray;
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

    removeWhiteSpacetokens: function(tokenArray){
        return tokenArray.filter(tkn => tkn.type != "ws");
    },

    mergePrefixesFromQueryAndConfig: function(prefixesQuery, prefixesConfig){
        let merged = {...prefixesConfig, ...prefixesQuery}; // query's prefixes overrides configs'.

        return merged;
    },

    // addPrefixesToQuery: function(prefixes){
    //     const prefixStrings = [];

    //     for (const [key, value] of Object.entries(prefixes)){
    //         prefixStrings.push(`PREFIX ${key}: <${value}>`);
    //     }

    //     const toAdd = prefixStrings.join("\n");
    //     this.yasqe.setValue(toAdd + "\n" + this.yasqe.getValue())
    // }

    msToTime: function(s) {
        var ms = s % 1000;
        s = (s - ms) / 1000;
        var secs = s % 60;
        s = (s - secs) / 60;
        var mins = s % 60;
        var hrs = (s - mins) / 60;

        var string = "";

        if(hrs != 0) string += hrs + "hours, ";
        if(mins != 0) string += mins + "mins, ";

        string += secs + '.' + ms + 'sec';

        return string;
    }
};