import { constants, NotHandledError } from "./constants";

export const parsed_operations = {
    // PARSED QUERY HANDLING

    removeModifiers: function(parsedQueryTree){
        switch(parsedQueryTree.type){
            case "query":
                parsedQueryTree.distinct = false;
                parsedQueryTree.offset = 0;
                delete parsedQueryTree.limit;
                delete parsedQueryTree.group;
                delete parsedQueryTree.order;
                delete parsedQueryTree.having;
            case "query":
            case "union":
            case "group":
            case "graph":
            case "optional":
            case "bgp":
            case "filter":
                break;

            default:
                // triples don't have a type, so we have to check it ourselves
                if(this.isParsedTriple(parsedQueryTree)) break;
                throw new NotHandledError("Can't remove modifiers from unrecognized element type : " + parsedQueryTree.type, "unimplemented");
        }
    },

    trim: function(parsedQueryTree){
        if(this.isParsedTriple(parsedQueryTree)) return [parsedQueryTree];
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
                // No optional : these clauses are not relevant in providing suggestions that lead to results.
                // However, they drastically increase source selection processing time. 
                // Thus, optional clauses are not worth keeping inside the auto completion query.
                // Of course, we still have to keep the content of the optional clause containing the current triple, if there is such an optional clause.
                // PS : Optional clauses still provide value, as they may help getting more accurate cardinality estimations.

                if (this.isLabelOptional(parsedQueryTree)) return parsedQueryTree;

                return this.hasCurrentTriple(parsedQueryTree) ? [...parsedQueryTree.patterns] : [];

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
        
            default: // triple
                // triples don't have a type, so we have to check it ourselves
                if(this.isParsedTriple(parsedQueryTree)) return [parsedQueryTree];
                throw new NotHandledError("Can't trim unrecognized element type : " + parsedQueryTree.type);
        }
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
            case "bind":
                return [];

            default:
                // triples don't have a type, so we have to check it ourselves
                if(this.isParsedTriple(parsedQueryTree)) return [parsedQueryTree];
                throw new NotHandledError("Can't extract triples from unrecognized element type : " + parsedQueryTree.type);
        }
    },

    getFilters: function(parsedQueryTree){
        switch(parsedQueryTree.type){
            case "filter":
                return [parsedQueryTree];

            case "query":
                return parsedQueryTree.where.reduce(
                        (acc, val) => acc.concat(this.getFilters(val)),
                        []  
                    ); 
            
            case "graph":
            case "union":
            case "group":
                return parsedQueryTree.patterns.reduce(
                    (acc, val) => acc.concat(this.getFilters(val)),
                    []  
                ); 

            case "optional":
                return parsedQueryTree.patterns.reduce(
                    (acc, val) => acc.concat(this.getFilters(val)),
                    []  
                ); 
            
            case "bind":
            case "bgp":
                return [];

            default: 
                // triples don't have a type, so we have to check it ourselves
                if(this.isParsedTriple(parsedQueryTree)) return [parsedQueryTree];
                throw new NotHandledError("Can't extract filters from unrecognized element type : " + parsedQueryTree.type);
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

            case "bind":
            case "filter":
                break;

            default: 
                // triples don't have a type, so we have to check it ourselves
                if(this.isParsedTriple(parsedQueryTree)) break;
                throw new NotHandledError("Can't mark element type : " + parsedQueryTree.type);
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
            case "bind":
                return false;
            
            default:
                // triples don't have a type, so we have to check it ourselves
                if(this.isParsedTriple(parsedQueryTree)) return parsedQueryTree.isCurrentTriple;
                throw new NotHandledError("Can't check for current triple in unrecognized element type : " + parsedQueryTree.type);
        }
    },

    markTriplesAndFilters: function(triples, filters, variables){
        let lastSize = 0;

        const triplesAndFilters = triples.concat(filters);

        while(lastSize !== variables.length){
            lastSize = variables.length;

            // Add all variables linked to the variables of the triple being written.
            // TODO : find more efficient / elegant way to do this
            for(const element of triplesAndFilters){

                for(const variable of this.getVarsFromParsedElementWithVariables(element)){

                    if(variables.includes(variable)){

                        for(const eltVar of this.getVarsFromParsedElementWithVariables(element)){

                            if(!variables.includes(eltVar)){
                                variables.push(eltVar);
                            }
                        }

                        element.inContext = true;
                        break;
                    }
                }
            }
        }
    },

    isLabelOptional: function(parsedQueryTree){
        if(!this.isParsedTriple(parsedQueryTree.patterns[0].triples[0])) return false;
        var variables = this.getVarsFromParsedTriple(parsedQueryTree.patterns[0].triples[0]);

        return variables.includes(constants.sugg_var) && variables.includes(constants.label_var)
    },

    isParsedTriple: function(element){
        try {
            return element.subject.termType && element.predicate.termType && element.object.termType;
        } catch(e) {
            return false;
        }
    },

    getVarsFromParsedTriple: function(triple){
        let vars = [];

        triple.subject.termType === "Variable" ? vars.push(triple.subject.value) : {};
        triple.predicate.termType === "Variable" ? vars.push(triple.predicate.value) : {} ;
        triple.object.termType === "Variable" ? vars.push(triple.object.value) : {} ;

        return vars;
    },

    getVarsFromParsedFilter: function(filter){
        if(filter.type !== "filter") throw new Error("Not a filter");

        return this.getVarsFromOperation(filter.expression)
    },

    getVarsFromOperation: function(operation){
        if(operation.type !== "operation") throw new Error("Not an operation");

        return operation.args.reduce(
            (acc, val) => {
                if(val.termType){
                    if(val.termType === "Variable") return acc.concat([val.value]);
                    return acc.concat([]);
                }

                if(val.type && val.type === "operation")
                    return acc.concat(this.getVarsFromOperation(val));
                
                throw new Error("Unexpected object inside operation arguments");
            },
            []  
        ); 
    },

    getVarsFromParsedElementWithVariables: function(element){
        if (this.isParsedTriple(element)) return this.getVarsFromParsedTriple(element);

        if(element && element.type){
            switch(element.type){
                case "filter":
                    return this.getVarsFromParsedFilter(element);

                default:
                    throw new Error("Unsupported element type :", element.type);
            }
        }

        throw new NotHandledError("Element is null or has no type; can't extract variables.");
    },

    
}