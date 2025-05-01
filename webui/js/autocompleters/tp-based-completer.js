
/// Queries the endpoint to retrieve a few example of values
/// from the current triple pattern being type. This is
/// context-insensitive since it does not take into account the
/// other operations of the SPARQL query.
export const TPBasedCompleter = {
    name: "tp-based-completer",
    autoShow: true,
    get: function(yasqe, token) {
        return Promise.resolve(['https://ex1.org', 'https://ex2.org'])
    },
    isValidCompletionPosition: function (yasqe) {
        const token = yasqe.getCompleteToken();
        console.log(token);
        if (token.string.length == 0) return false; //we want -something- to autocomplete
        if (token.string[0] === "?" || token.string[0] === "$") return false; // we are typing a var
        return token.state.possibleFullIri; // when fully typed, the possible full iri is false, which is not convenient
        // if (token.state.possibleCurrent.indexOf("a") >= 0) return true; // predicate pos
        // return false;
    },

};
