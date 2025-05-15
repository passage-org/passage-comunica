
/// When a keywords is started, it allows autocompleting based on typed
/// characters, but also filter by possible token at cursor position.
export const KeywordsCompleter = {
    // ugly, would be better coming from a dedicated package such as
    // sparqlalgebra or even in yasgui, but seems complicated to retrieve
    // them, whereas the set of keywords is easily writable.
    
    keywords : ['SELECT','DISTINCT','CONSTRUCT','DESCRIBE','ASK','WHERE',
                'FROM','NAMED','PREFIX','BASE','OPTIONAL','FILTER',
                'GRAPH','LIMIT','OFFSET','SERVICE','UNION','EXISTS','NOT',
                'BINDINGS','MINUS','ORDER','BY','VALUES','ISIRI','IF','STR',
                'REPLACE','AS','URI','BIND','COUNT','GROUP','DESC','ASC','A'],
    
    name: "keywords-completer",
    autoShow: true,
    bulk: false, // press <ctrl-space> to autocomplete
    
    get: function(yasqe, token) {
        if (!token) {return Promise.resolve([]);}; // <= mostly important for bulk, but we keep it
        return Promise.resolve(this.getPossibleKeywords(token.string, token.state.possibleCurrent));
    },
    
    isValidCompletionPosition: function (yasqe) {
        const token = yasqe.getCompleteToken();
        if (token.string.length === 0) { return false };
        const possibilities = this.getPossibleKeywords(token.string, token.state.possibleCurrent);
        if (possibilities.length === 1 && possibilities[0] === token.string) { // exact match already
            return false;
        }
        return possibilities.length > 0;
    },

    /// returns the list of keywords that are possible depending on what's being typed.
    getPossibleKeywords(typed, possibilities) {
        return possibilities.filter(p => p.includes(typed.toUpperCase()) && this.keywords.includes(p.toUpperCase()));
    },
};
