
/// Queries of the WDBench benchmark that targets a Wikidata dataset.
export const WDBenchQueries = [
    { name: "query 139",
      query: "" },
    { name: "query 171",
      query: "" },
    { name: "query 183",
      query: "" },
    { name: "query 209",
      query: "" },
    { name: "query 347",
      description: "All cities and associated country with their mayor as head of government",
      expect: 1,
      query: `SELECT * WHERE {
  ?x1 <http://www.wikidata.org/prop/direct/P17> ?x2 .
  ?x1 <http://www.wikidata.org/prop/direct/P31> <http://www.wikidata.org/entity/Q515> .
  ?x2 <http://www.wikidata.org/prop/direct/P31> <http://www.wikidata.org/entity/Q6256> .
  ?x3 <http://www.wikidata.org/prop/direct/P39> <http://www.wikidata.org/entity/Q30185> .
  ?x3 <http://www.wikidata.org/prop/direct/P6> ?x1 .
}` },
    { name: "query 357",
      description: "All people with their country and respective continent (Mistakes?)",
      expect: 1327,
      query: `SELECT * WHERE {
  ?x1 <http://www.wikidata.org/prop/direct/P17> ?x2 .
  ?x2 <http://www.wikidata.org/prop/direct/P30> ?x3 .
  ?x1 <http://www.wikidata.org/prop/direct/P31> <http://www.wikidata.org/entity/Q5> .
}` },
    { name: "query 358",
      description: "All tennis national teams along with their respective country's sport governing body",
      expect: 109,
      query: `SELECT * WHERE {
  ?x1 <http://www.wikidata.org/prop/direct/P17> ?x2 .
  ?x3 <http://www.wikidata.org/prop/direct/P17> ?x2 .
  ?x1 <http://www.wikidata.org/prop/direct/P31> <http://www.wikidata.org/entity/Q1194951> .
  ?x3 <http://www.wikidata.org/prop/direct/P31> <http://www.wikidata.org/entity/Q2485448> .
  ?x1 <http://www.wikidata.org/prop/direct/P641> <http://www.wikidata.org/entity/Q847> .
  ?x3 <http://www.wikidata.org/prop/direct/P641> <http://www.wikidata.org/entity/Q847> .
}` },
    { name: "query 360",
      description: "All cities and associated country whose mayor is female",
      expect: 10,
      query: `SELECT * WHERE {
  ?x1 <http://www.wikidata.org/prop/direct/P17> ?x2 .
  ?x3 <http://www.wikidata.org/prop/direct/P21> <http://www.wikidata.org/entity/Q6581072> .
  ?x1 <http://www.wikidata.org/prop/direct/P31> <http://www.wikidata.org/entity/Q515> .
  ?x2 <http://www.wikidata.org/prop/direct/P31> <http://www.wikidata.org/entity/Q6256> .
  ?x3 <http://www.wikidata.org/prop/direct/P39> <http://www.wikidata.org/entity/Q30185> .
  ?x1 <http://www.wikidata.org/prop/direct/P6> ?x3 .
}` },
    { name: "query 362",
      query: "" },
    { name: "query 604",
      description: "All pairs of people with identical birth and death dates",
      expect: 25276453,
      query: `PREFIX wdd: <http://www.wikidata.org/prop/direct/>
PREFIX wde: <http://www.wikidata.org/entity/>

SELECT * WHERE {
    ?x1 wdd:P31  wde:Q5 .  # a human being
    ?x2 wdd:P31  wde:Q5 .  # another human being
    ?x1 wdd:P569 ?x3 .     # with a birthdate
    ?x2 wdd:P569 ?x3 .     # birthdate is identical
    ?x1 wdd:P570 ?x4 .     # with a date of death
    ?x2 wdd:P570 ?x4 .     # death date is identical
}`
    },
    { name: "query 605",
      expect: 4802920630,
      description: "All pairs of people that attended the same educational institution",
      query: `SELECT * WHERE {
  ?x1 <http://www.wikidata.org/prop/direct/P31> <http://www.wikidata.org/entity/Q5> .
  ?x2 <http://www.wikidata.org/prop/direct/P31> <http://www.wikidata.org/entity/Q5> .
  ?x1 <http://www.wikidata.org/prop/direct/P69> ?x3 .
  ?x2 <http://www.wikidata.org/prop/direct/P69> ?x3 .
}` },
    { name: "query 633",
      description: "All people with their respective PubMed ID" ,
      expect: 34916061,
      query: `SELECT * WHERE {
  ?x1 <http://www.wikidata.org/prop/direct/P31> ?x2 .
  ?x1 <http://www.wikidata.org/prop/direct/P698> ?x3 .
}` },
    { name: "query_631",
      query: "" },
    { name: "query_630",
      query: "" },
    { name: "query 679",
      description: "All human beings that are in publications (Mistakes?)",
      expect: 259,
      query: `SELECT * WHERE {
  ?x1 ?x2 <http://www.wikidata.org/entity/Q5> .
  ?x1 <http://www.wikidata.org/prop/direct/P1433> ?x3 .
}`},
    { name: "query 256",
      description: "The name, issue, and volume of every publication",
      expect: 29977745,
      query: `SELECT * WHERE {
  ?x1 <http://www.wikidata.org/prop/direct/P1433> ?x2 .
  ?x1 <http://www.wikidata.org/prop/direct/P433> ?x3 .
  ?x1 <http://www.wikidata.org/prop/direct/P478> ?x4 .
}`}
];
