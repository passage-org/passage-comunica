# sage-comunica

[Comunica](https://github.com/comunica/comunica) is a SPARQL query
engine with an emphasis on modularity. To ensure completeness of query
results, it already includes actors such as quad pattern fragments
(qpf), or brqpf. We want to provide one for *continuation* queries. 


However, Comunica's documentation encourages forks. In this project,
we want to integrate our actors without drowning them in the mass of
already implemented actors. No forks.

## Build and run

```shell
# Get the dependencies
yarn install
# Compile and generate
yarn run build

# Create the main executable
cd engines/query-sages
yarn run prepare

# It runs similarly to your good old Comunica
node bin/query.js sage@localhost:3000/watdiv10M.jnl/sage \
    -f path/to/query --logLevel=debug > results.dat
```
