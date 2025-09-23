import { constants } from "../context-sensitive-completer-modules/constants";

export const results_processing = {
    // AUTOCOMPLETION QUERY RESULTS POST PROCESSING

    processACQResults: function(acqResults, currentString, filterLang){

        const filterString = currentString.toLowerCase();

        // No empty mappings, no mapping with probability of 0!
        const successfulWalks = acqResults
            .filter(mapping => Object.keys(mapping).length !== 0)
            .filter(mapping => mapping[constants.proba_var].value > 0);
        const nbResultsQuery = successfulWalks.length;

        const formatted = this.formatBindings(successfulWalks);
        console.log(formatted)

        const filtered = formatted.filter(mappingInfo => this.filterByString(mappingInfo, filterString))
                                    .filter(mappingInfo => this.filterByLang(mappingInfo, filterLang));
        const grouped = this.groupBy(filtered, 'id');
        const aggregated = this.aggregate(grouped, nbResultsQuery);

        return aggregated
            // building the item containing the data needed for display
            .map(suggestion => {
                return {
                    value: suggestion.value, 
                    label: suggestion.label,
                    labelLang: suggestion.labelLang,
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
                labelLang: "",
                label: "",
                type: "",
                id: "",
                provenances: [],
                probability: 0
            };

            for(const [key, val] of Object.entries(b)){
                if(key.includes("provenance")){
                    // Provenance var

                    // For suggestion_variable (= final result provenance)
                    if(key.includes(constants.sugg_var)) formatted.suggestionVariableProvenance = val.value;

                    // Update provenances set if needed
                    if(!formatted.provenances.includes(val.value)) formatted.provenances.push(val.value);
                } else

                if(key.includes(constants.proba_var)) {
                    formatted.probability = val.value;
                } else 
                
                if(key === constants.sugg_var) {
                    formatted.id = this.typedStringify(val);

                    // in case we're dealing with a tagged literal, we also extract the label (itself) and the language
                    const langTagRegex = /\"@.*$/g
                    if(formatted.id.match(langTagRegex)) {
                        console.log("MATCHED");
                        var split = formatted.id.split("@");
                        formatted.label = split.slice(0, -1).join("");
                        formatted.labelLang = split.at(-1);
                        console.log(formatted);
                    }

                    formatted.type = val.type;
                }
                if(key === constants.label_var) {
                    formatted.label = val.value;
                    if(val["xml:lang"]) formatted.labelLang = val["xml:lang"];
                    // TODO : check if the language tag can present in "val" under another form that a disignated "xml:lang" property.
                    // for instance, could it be part of the string itself, like '"label"@en'?
                }
            }

            return formatted;
        })
    },

    filterByString: function(mappingInfo, filterString) {

        if(filterString === "") return true;

        const isStringLiteralStart = function(string){
            return string.startsWith("\"");
        }

        // TODO: https 
        const isUriStart = function(string){
            return string.startsWith("<");
        }

        const getStringWithoutUriStart = function(string){
            return string.replace(regexHTTPS, "").replace(regexHTTP, "").replace(regexUriStart, "");
        }

        const toTest = mappingInfo.id.toLowerCase();
        const label = mappingInfo.label.toLowerCase();
        const type = mappingInfo.type;

        if(isStringLiteralStart(filterString)){
            if(type === "literal" && (toTest.includes(filterString.slice(1)) || label.includes(filterString.slice(1)))) return true;
        }

        if(isUriStart(filterString)){
            if(toTest.includes(getStringWithoutUriStart(filterString)) || label.includes(getStringWithoutUriStart(filterString))) return true;
        } else {
            if(toTest.includes(filterString) || label.includes(filterString)) return true;
        }

        return false;
    },

    filterByLang: function(mappingInfo, filterLang){

        const labelLang = mappingInfo.labelLang.toLowerCase().split("-")[0];
        const filterLangShort = filterLang.split("-")[0];

        if (labelLang === "") return true;

        return filterLangShort === labelLang;
    },

    aggregate: function(suggestionGroups, nbResultsQuery){
        
        // We could recompute nbResultsQuerys here, but it would extra and inefficient work, so no thank
        const aggregated = [];

        for(const [key, val] of Object.entries(suggestionGroups)){
            const firstWithLabel = val.find(elt => elt.label);

            const groupLabel = firstWithLabel ? firstWithLabel.label : "";
            const groupLabelLang = firstWithLabel ? firstWithLabel.labelLang : "";

            // What if the same entity (key) has multiple labels accross the elements of this group?
            // What if the first element with a label doesn't have a language tag, but another element with the same label did?
            
            // By this point, each element should have no label or one label, and that label should have only one value accross the whole group. 
            // For example {"fr", "", "fr", "fr"}

            aggregated.push(
                {
                    value : key,
                    score : (val.reduce((acc, curr) => {return acc + (curr.probability > 0 ? 1/curr.probability : 0)}, 0.0) / val.length) * (val.length / nbResultsQuery),
                    nbWalks : val.length,
                    label : groupLabel,
                    labelLang : groupLabelLang, 

                    // TODO : percentage?
                    provenances : Array.from(new Set(val.map(val => val.provenances).flat())),
                    suggestionVariableProvenances : Array.from(new Set(val.map(val => val.suggestionVariableProvenance))),
                }
            );
        }

        return aggregated;
    },

    groupBy: function(xs, key, subKey) {
        return xs.reduce(function(rv, x) {

            (rv[x[key][subKey] ?? x[key]] ??= []).push(x);
            return rv;
        }, {});
    },

    typedStringify: function(entity) {

        const entityValue = entity.value;

        switch(entity.type) {
            case 'iri':
            case 'uri':
                for(const [key, val] of Object.entries(this.yasqe.getPrefixesFromQuery())){
                    if(entityValue.includes(val)) {
                        return entityValue.replace(val, key+":")
                    }
                }

                return "<" + entityValue + ">"
            case 'literal':
                const lang = entity["xml:lang"] ? `@${entity["xml:lang"]}` : "";
                return "\"" + entityValue + "\"" + lang
            default:
                return "UNKNOWN TYPE : " + entityValue
        }
    }
}