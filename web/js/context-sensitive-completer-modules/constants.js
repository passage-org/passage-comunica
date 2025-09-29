import ColorHash from 'color-hash';

export const constants = {
    proba_var: "probabilityOfRetrievingRestOfMapping",
    sugg_var: "suggestion_variable",
    label_optional : `OPTIONAL { ?suggestion_variable <http://www.w3.org/2000/01/rdf-schema#label> ?label_variable }`,
    q_proba_var: "?probabilityOfRetrievingRestOfMapping",
    q_sugg_var : "?suggestion_variable",
    label_var: "label_variable",
    sugg_var: "suggestion_variable",
    regexHTTPS: new RegExp("^<https://", "i"),
    regexHTTP: new RegExp("^<http://", "i"),
    regexUriStart: new RegExp("^<", "i"),
    colorHash: new ColorHash(), 
    xsd: "http://www.w3.org/2001/XMLSchema#"
}

export class NotHandledError extends Error {
    type;

    constructor(type, message, ...params){
        super(message, params);
        this.type = type;
    }
}