
/// When a keywords is started, it allows autocompleting based on typed
/// characters, but also filter by possible token at cursor position.
export const KeywordsCompleter = {
    // ugly, would be better coming from a dedicated package such as
    // sparqlalgebra or even in yasgui, but seems complicated to retrieve
    // them, whereas the set of keywords is easily writable.
    // comes from : https://www.w3.org/TR/sparql11-query/#rQuery
    keywords : ['PREFIX', 'BASE',
                'SELECT','CONSTRUCT','DESCRIBE','ASK',
                'FROM', 'NAMED',
                'DISTINCT', 'WHERE',
                'OPTIONAL','FILTER',
                'GRAPH','LIMIT','OFFSET','SERVICE','SILENT','UNION','EXISTS','NOT',
                'MINUS','ORDER','BY','VALUES','IF',
                'REPLACE','AS','BIND','GROUP','DESC','ASC','A',
                'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'SAMPLE', 'GROUP_CONCAT',
                'COALESCE', 'IN', 'HAVING',
                'LANG', 'LANGMATCHES', 'DATATYPE', 'BOUND', 'IRI', 'URI',
                'BNODE', 'RAND', 'STR', 'ABS', 'CEIL', 'FLOOR', 'ROUND',
                'CONCAT', 'STRLEN', 'UCASE', 'LCASE', 'ENCODE_FOR_URI', 'CONTAINS',
                'STRSTARTS', 'STRENDS', 'STRBEFORE', 'STRAFTER', 'YEAR', 'MONTH',
                'DAY', 'HOURS', 'MINUTES', 'SECONDS', 'TIMEZONE', 'TZ', 'NOW',
                'UUID', 'STRUUID', 'MD5', 'SHA1', 'SHA256', 'SHA384', 'SHA512',
                'STRLANG', 'STRDT', 'SAMETERM',
                'ISIRI', 'ISURI', 'ISBLANK', 'ISLITERAL', 'ISNUMERIC',
                'SUBSTR', 'REGEX'],
    
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
    /// The list is sorted by the depth of the match.
    getPossibleKeywords(typed, possibilities) {
        const upperCased = typed.toUpperCase();
        return possibilities.filter(p => p.includes(upperCased) && this.keywords.includes(p.toUpperCase()))
            .sort((a, b) => {return a.indexOf(upperCased) - b.indexOf(upperCased);});
    },
};
