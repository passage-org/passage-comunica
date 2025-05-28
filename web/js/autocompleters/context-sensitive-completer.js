
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

        return Promise.resolve(["THESE", "AREN'T", "ACTUAL", "SUGGESTIONS", "DUMMY"]);
    },
    isValidCompletionPosition: function (yasqe) {
        return true;
    },

    getAutocompletionQuery: function(yasqe, token) {
        //step 1
        const tokensAndIndex = this.getTokensFromCurrentContext(yasqe, token);
        const tokens = tokensAndIndex.tokens;
        const index = tokensAndIndex.idx; // index of the current token in the token array

        console.log(tokens);

        const triple = this.getACQueryTriple(yasqe, tokens, index);

        console.log(triple);

        //step 2
        // const tree = this.getQueryTree(tokens);

    },

    // utils
    getTokensFromCurrentContext: function(yasqe, token) {
        const line = yasqe.getDoc().getCursor().line;
        const ch = yasqe.getDoc().getCursor().ch;

        // works only for unfinished but well bracketed queries 

        // step 1.1:
        // go up from current token, retrieve all tokens you come across in reverse order until you find the last GRAPH / UNION / OPTIONAL / FILTER and count the number of brackets along the way
        // if you find optional, ignore and keep going 
        // store tokens in arr1
        const preContext = this.getAllPreviousTokensFromContextAndBracketCount(yasqe, token, line)
        let arr1 = preContext.tokenArray.slice(0, -1); // last element == current token == first element of arr2, to avoid duplicates
        let currentTokenIndex = arr1.length;


        // step 1.2: 
        // come back to current token with bracket, retrieve all tokens you come across in the same order until you come accross the end of the query or the bracket count is 0. 
        // store tokens in arr2
        let arr2 = this.getAllNextTokensFromContext(yasqe, line, ch + 1, preContext.bracketCount);

        // console.log(arr1)
        // console.log(token.type === "ws" ? [] : [token])
        // console.log(arr2)
        let conc = arr1.concat(token.type === "ws" ? [] : [token]).concat(arr2);
        // let conc = arr1.concat([token]).concat(arr2);

        return {tokens: conc, idx: currentTokenIndex};
    },

    getAllPreviousTokensFromContextAndBracketCount: function(yasqe, startingToken, startingLine){
        let prev = startingToken;
        let line = startingLine;

        let skipUnion = false;
        let skipPrev = false;
        let endOfUnion = [];

        const shouldStop = function(token){
            return token.state.stack.length === 1 && token.state.stack[0] === "sparql11"
        };

        let count = 0;
        // let countBuffer = 0;

        const tokenArray = []
        // let tokenArrayBuffer = []

        while(!shouldStop(prev)){

            // tokenArrayBuffer.push(prev)

            // if(prev.string === "{") countBuffer++;
            // if(prev.string === "}") countBuffer--;
            if(prev.string === "{") count++;
            if(prev.string === "}") count--;

            /* switch (prev.string.toLowerCase()) {
                case "graph":
                case "filter":
                case "union":
                case "optional":
                case "select":
                    tokenArray.push(...tokenArrayBuffer);
                    tokenArrayBuffer = [];
                    count = countBuffer;
                    break;
                default:
                    break;
            } */

            if(skipUnion && count === endOfUnion.at(-1)){ // We've closed the brackets for that union branch
                skipUnion = false;
                skipPrev = true; // We're on the closing bracket of a union branch we want to skip. We do not want that closing bracket, we want everything after
                endOfUnion.pop();
                console.log("LISTEN")
            }

            if(prev.string.toLowerCase() === "union" && count > 0){ // We are coming across a union while having started inside one of its branches
                skipUnion = true;
                endOfUnion.push(count);
                console.log("HEY")
                // if(tokenArray.at(-1).string.toLowerCase() === "UNION") tokenArray.pop() // kind of brutal, but we remove the union token a posteriori
            }
            
            if(!skipUnion && !skipPrev){
                tokenArray.push(prev);
            }

            skipPrev = false;

            prev = this.getPreviousNonWsTokenMultiLine(yasqe, line, prev);
            line = prev.line;
        }


        tokenArray.reverse(); //reverse order to get first token of the query body first in the array
        while(tokenArray[0].string !== "{") tokenArray.shift(); //removing everything from the initial SELECT...WHERE claus
        return {tokenArray: tokenArray, bracketCount: count};
    },

    getAllNextTokensFromContext: function(yasqe, line, char, bracketCount){
        // Variables to keep track of where we are inside the query / scope
        let skipUnion = false;
        let skipNext = false;
        let endOfUnion = [];
        let count = 0;

        let next = this.getNextNonWsTokenMultiLine(yasqe, line, char);
        line = next.line;

        const tokenArray = []

        const shouldStop = function(count, next){
            return count + bracketCount === 0 || !next;
        };

        while(!shouldStop(count, next)){

            line = next.line;
            char = next.end + 1;

            if(next.string === "{") count++;
            if(next.string === "}") count--;

            if(skipUnion && count === endOfUnion.at(-1)){ // We've closed the brackets for that union branch
                skipUnion = false;
                skipNext = true; // We're on the closing bracket of a union branch we want to skip. We do not want that closing bracket, we want everything after
                endOfUnion.pop();
                console.log("LISTEN")
            }

            if(next.string.toLowerCase() === "union" && count < 0){ // We are coming across a union while having started inside one of its branches
                skipUnion = true;
                endOfUnion.push(count);
                console.log("HEY")
                // if(tokenArray.at(-1).string.toLowerCase() === "UNION") tokenArray.pop() // kind of brutal, but we remove the union token a posteriori
            }

            if(!skipUnion && !skipNext){
                tokenArray.push(next);
            }

            skipNext = false;

            next = this.getNextNonWsTokenMultiLine(yasqe, line, char);
        }

        if(shouldStop(count, next)) return tokenArray;
        throw new Error("The query couldn't be parsed : brackets not well formed")
    },

    getNextTokenAfterUnion: function(yasqe, line, char) {

    },

    getTriple: function(tokenArray, index){
        let triple = {};
        triple.variables = [];

        const before = this.getTripleBefore(tokenArray, index - 1);
        const after = this.getTripleAfter(tokenArray, index + 1);

        const tripleTokens = before.concat(after);

        tripleTokens.forEach(elt => {if(elt.type === "atom") triple.variables.push(elt.string)}); // keep all variable

        const entities = this.getTokenGroupsOfTriple(tripleTokens);

        triple.subject = this.stringifyTokenGroup(entities[0]);
        triple.predicate = this.stringifyTokenGroup(entities[1]);
        triple.object = this.stringifyTokenGroup(entities[2]);
        
        return triple;
    },

    getACQueryTriple: function(yasqe, tokenArray, index){
        const line = yasqe.getDoc().getCursor().line;
        const ch = yasqe.getDoc().getCursor().ch;

        let triple = {};
        let subject, predicate, object;
        let variables = [];

        const before = this.getTripleBefore(tokenArray, index - 1);
        const after = this.getTripleAfter(tokenArray, index + 1);

        const tripleTokens = before.concat([tokenArray[index]]).concat(after);

        tripleTokens.forEach(elt => {if(elt.type === "atom") variables.push(elt.string)}); // keep all variable

        const entities = this.getTokenGroupsOfTriple(tripleTokens);

        console.log(entities)

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

            if(this.isPosBeforeToken(line, ch, entities[0][-1])){
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

            // console.log(entities[1][0]);
            // console.log(entities[0].at(-1));
            // console.log(this.isPosBeforeToken(line, ch, entities[1][0]));
            // console.log(this.isPosAfterToken(line, ch, entities[0].at(-1)));

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
        }

        triple.subject = subject;
        triple.predicate = predicate;
        triple.object = object;

        triple.variables = variables;

        // console.log(triple);

        return triple;
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
                case "string-2": //blank node
                case "atom":// variable
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
                    break;

                case "punc":
                    if(token.string === "." 
                    || token.string === ";"
                    || token.string === ",") break;

                default:
                    console.log("WARN : No entites found");
                    return []
            }

            idx++;
        }
        
        return entities;
    },
    

    getTripleBefore: function(tokenArray, index){
        if(index <= -1) return [];
        const current = tokenArray[index];
        switch (current.type) {
            case "atom":// variable
            case "variable-3": // uri
            case "string": // literal
            case "string-2": // blank node
            case "number": // number
                return this.getTripleBefore(tokenArray, index - 1).concat([current]);

            case "punc": // ^^
                if(current.string === "^^") return this.getTripleBefore(tokenArray, index - 1).concat([current]);

            case "meta": // @
                if(current.string.startsWith("@")) return this.getTripleBefore(tokenArray, index - 1).concat([current]);

            default:
                return []
        }
    },

    getTripleAfter: function(tokenArray, index){
        if(index >= tokenArray.length) return [];
        const current = tokenArray[index];
        switch (current.type) {
            case "atom":// variable
            case "variable-3": // uri
            case "string": // literal
            case "string-2": //blank node
            case "number": // number
                return [current].concat(this.getTripleAfter(tokenArray, index + 1));

            case "punc": // ^^
                if(current.string === "^^") return [current].concat(this.getTripleAfter(tokenArray, index + 1));
                if(current.string === "." 
                || current.string === ";"
                || current.string === ",") return [current];

            case "meta": // @
                if(current.string.startsWith("@")) return [current].concat(this.getTripleAfter(tokenArray, index + 1));
            
            default:
                if(current.string === "." 
                || current.string === ";"
                || current.string === ",") return [current];
                return []
        }
    },

    // tokens getter (previous / next)
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
        let next = yasqe.getNextNonWsToken(line, currentPos);

        if (next && !next.type) return this.getNextNonWsTokenMultiLine(yasqe, line, next.end + 1);

        if (!next && line < yasqe.getDoc().lineCount() - 1) return this.getNextNonWsTokenMultiLine(yasqe, line + 1, 0);

        if (next) next.line = line;

        return next;
    },

    stringifyTokenGroup: function(tokenArray){
        const strings = [];
        tokenArray.forEach(token => {
            strings.push(token.string)
        });
        return strings.join("");
    },

    isPosBeforeToken: function(line, ch, token){
        return this.isBefore(line, ch, token.line, token.start)
    },

    isBefore: function(line1, ch1, line2, ch2){
        return (line1 === line2 && ch1 < ch2) || line1 < line2;
    },

    isPosAfterToken(line, ch, token){
        return this.isAfter(line, ch, token.line, token.end)
    },
    
    isAfter: function(line1, ch1, line2, ch2){
        return (line1 === line2 && ch1 > ch2) || line1 > line2;
    },

    // stupid
    printArray: function(array){
        console.log("--------------------");
        let idx = 0;
        let elt = array[idx];
        while(elt){
          console.log("-----------");
  
          console.log("element ", elt);
          console.log("idx ", idx);
  
          console.log("-----------");
  
          elt = array[idx];
          idx++;
        }
        console.log("length : ", idx);
        console.log("--------------------");
      },
};
