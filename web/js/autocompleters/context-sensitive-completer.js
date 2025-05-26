
/// Queries the endpoint to retrieve a few example of values
/// from the current triple pattern being type. This is
/// context-insensitive since it does not take into account the
/// other operations of the SPARQL query.
export const CSCompleter = {
    name: "context-sensitive-completer",
    autoShow: false,
    bulk: false,
    cache: new Object(),
    get: function(yasqe, token) {
        return Promise.resolve([""]);
    },
    isValidCompletionPosition: function (yasqe) {
        return true;
    },
};
