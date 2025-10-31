
/// Queries extractred from the official Wikidata website.
/// These are slightly modified to remove SERVICE that are
/// specific to wikidata, i.e., outside of the standard.
export const WikidataQueries = [
    { name: 'all_stars',
      description: 'All stars.',
      query: `PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>

# A first shot at getting the top 10 of stars:
# Retrieve all 3M stars of the dataset.
SELECT ?star WHERE {
  ?star wdt:P31 wd:Q523 # ?star is_a star!
}
` },
    { name: 'all_stars_image_brightness',
      description: 'All stars with associated images and brightness.',
      query: `PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>

# A second step at getting the top 10 of stars:
# Retrieve all stars with their images and brightness.
SELECT ?star ?images ?apparent_magnitude WHERE {
  ?star wdt:P31 wd:Q523; # ?star is_a star!
        wdt:P1215 ?apparent_magnitude; # the lower the magnitude the higher the brightness
        wdt:P18 ?images .
}
` },    
    { name: 'stars',
      description: 'Top 10 of the brightest stars.',
      query: `PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>

# This query comes from the Wikidata's official examples,
# and actually times out… Of course, there are a lot
# of stars. It took 1300s for us.
SELECT DISTINCT ?star ?images ?apparent_magnitude WHERE {
  ?star wdt:P31/wdt:P279* wd:Q523; # is a star!
        wdt:P1215 ?apparent_magnitude;
        wdt:P18 ?images .
  FILTER(?apparent_magnitude < 1)
}
ORDER BY (?apparent_magnitude)
LIMIT 10
` },
    { name: "cite",
      description: "Articles from the journal PLOS One that cite each other.",
      query: `PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>

# The query times out on the official Wikidata endpoint since
# the search space is huge.
# Using the passage endpoint, it should take at most ~40 minutes.
# You can check this estimate by inspecting the continuation
# queries and the progress of offsets during the query execution.
SELECT ?article1 ?article2 WHERE {
  ?article1 wdt:P1433 wd:Q564954. # |PLOS One| = 252130
  ?article1 wdt:P2860 ?article2 . # |cites| = 286193302
  ?article2 wdt:P2860 ?article1 .
  FILTER(?article1 != ?article2)
}`},
    { name: "cats",
      description: "Retrieves all cats with their name.",
      query: `PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT DISTINCT ?item ?itemLabel WHERE {
  ?item wdt:P31 wd:Q146 . # This must be a cat
  ?item rdfs:label ?label . # instead of SERVICE wikibase:label
  FILTER (lang(?label) = "en" || lang(?label) = "mul" || lang(?label) = "fr").
  BIND (str(?label) AS ?itemLabel)
}`},
    { name: 'horses',
      description: 'Retrieves all horses with associated parameters when they exist.',
      query: `PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

# The query about horses has been slightly modified
# to be runnable by comunica. Changes include:
# - the property path is a lot simpler to avoid spam;
# - birthdates, deathdates are not converted in year;
# - labels are retrieved using regular methods.
SELECT DISTINCT ?horse ?horseLabel ?mother ?motherLabel ?father ?fatherLabel ?birthdate ?deathdate ?genderLabel WHERE {
  ?horse wdt:P31/wdt:P279 wd:Q726 .     # Instance of and subclasses of Q726 (horse)

  OPTIONAL{?horse wdt:P25 ?mother . ?mother rdfs:label ?motherLabel .}  # mother
  OPTIONAL{?horse wdt:P22 ?father . ?father rdfs:label ?fatherLabel .}  # father
  OPTIONAL{?horse wdt:P569 ?birthdate .} # date of birth
  OPTIONAL{?horse wdt:P570 ?deathdate .} # date of death
  OPTIONAL{?horse wdt:P21 ?gender .}     # sex or gender
}
ORDER BY ?horse `},

];
