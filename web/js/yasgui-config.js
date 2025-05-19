
/// Yasgui configuration can prove difficult, as it provides
/// extensive means to modify the data, but also ways to draw it.
/// 
/// Useful links for reference:
/// yasgui default: https://github.com/TriplyDB/Yasgui/blob/master/packages/yasgui/src/defaults.ts
/// yasqe default: https://github.com/TriplyDB/Yasgui/blob/master/packages/yasqe/src/defaults.ts
/// yasr default: https://github.com/TriplyDB/Yasgui/blob/master/packages/yasr/src/defaults.ts
export const YasguiConfig = {
    // #A Configure endpoints and autocompletion
    endpointCatalogueOptions: {
        getData: () => { return [
            {endpoint: "https://10-54-2-226.gcp.glicid.fr/wikidata/passage",
             title: "Wikidata"},
            {endpoint: "https://10-54-2-226.gcp.glicid.fr/watdiv/passage",
             title: "WatDiv"},]; },
        keys:["Wikidata", "WatDiv"],
        renderItem: (data, source) => {
            const endpointDiv = document.createElement("div");
            endpointDiv.classList.add('yasqe_endpoint_container');
            const endpointName = document.createElement("span");
            endpointName.classList.add('yasqe_endpoint_name');
            endpointName.innerHTML = data.value.title || "";
            const endpointUri = document.createElement("span");
            endpointUri.classList.add('yasqe_endpoint_uri');
            endpointUri.innerHTML =
                data.matches.endpoint?.reduce(
                    (current, object) => (object.highlight ? current + object.text.bold() : current + object.text),
                    ""
                ) || "";

            endpointDiv.appendChild(endpointName);
            endpointDiv.appendChild(endpointUri);
            source.appendChild(endpointDiv);
        },
    },

    // #B default values for yasqe query
    requestConfig: {
        endpoint: "https://10-54-2-226.gcp.glicid.fr/wikidata/passage",
        args: [{name:"limit", value:"100000"},
               {name:"timeout", value:"60000"}],
    },

    yasqe: {
        extraKeys: {
            "Cmd-Enter": function (_yasqe) {}, // execute disabled for now
            "Ctrl-Enter": function (_yasqe) {}, // execute disabled for now
        },
    },

    // #D no persitent, as it feels clunky
    // actually, we want to keep the request, only the results feel bad
    // persistencyExpire: 1,
    yasr: {
        persistencyExpire: 1,

        // automatically replace the uri with their prefix which
        // drastically increases lisibility.
        // Note: fully included prefix must succeed the longer one.
        //       For instance, psn must appear before ps.
        // Comes from: <https://en.wikibooks.org/wiki/SPARQL/Prefixes>
        prefixes: {
            "bd": "http://www.bigdata.com/rdf#",
            "bds": "http://www.bigdata.com/rdf/search#",
            "commons": "https://commons.wikimedia.org/wiki/File:",
            "cc": "http://creativecommons.org/ns#",
            "gas": "http://www.bigdata.com/rdf/gas#",
            "hint": "http://www.bigdata.com/queryHints#",
            "owl": "http://www.w3.org/2002/07/owl#",
            "psn": "http://www.wikidata.org/prop/statement/value-normalized/",
            "psv": "http://www.wikidata.org/prop/statement/value/",
            "ps": "http://www.wikidata.org/prop/statement/",
            "pqn": "http://www.wikidata.org/prop/qualifier/value-normalized/",
            "pqv": "http://www.wikidata.org/prop/qualifier/value/",
            "pq": "http://www.wikidata.org/prop/qualifier/",
            "prn": "http://www.wikidata.org/prop/reference/value-normalized/",
            "prv": "http://www.wikidata.org/prop/reference/value/",
            "pr": "http://www.wikidata.org/prop/reference/",
            "p": "http://www.wikidata.org/prop/",
            "prov": "http://www.w3.org/ns/prov#",
            "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
            "schema": "http://schema.org/",
            "skos": "http://www.w3.org/2004/02/skos/core#",
            "wds": "http://www.wikidata.org/entity/statement/",
            "wd": "http://www.wikidata.org/entity/",
            "wdata": "http://www.wikidata.org/wiki/Special:EntityData/",
            "wdno": "http://www.wikidata.org/prop/novalue/",
            "wdref": "http://www.wikidata.org/reference/",
            "wdt": "http://www.wikidata.org/prop/direct/",
            "wdv": "http://www.wikidata.org/value/",
            "wikibase": "http://wikiba.se/ontology#",
            "xsd": "http://www.w3.org/2001/XMLSchema#",
        },
    }

}
