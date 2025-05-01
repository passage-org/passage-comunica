
/// When a keywords is started, it allows autocompleting based on typed
/// characters, but also filter by possible token at cursor position.
export const KeywordsCompleter = {
    name: "keywords-completer",
    autoShow: true,
    get: function(yasqe, token) {
        // TODO
        return Promise.resolve(['https://ex1.org', 'https://ex2.org'])
    },
    isValidCompletionPosition: function (yasqe) {
        // TODO TODO
        const token = yasqe.getCompleteToken();
        console.log(token);
        if (token.string.length == 0) return false; //we want -something- to autocomplete
        if (token.string[0] === "?" || token.string[0] === "$") return false; // we are typing a var
        if (token.state.possibleCurrent.indexOf("IRI_REF") >= 0) return true; // predicate pos
        return false;
    },
};
