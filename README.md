# passage x comunica

[Comunica](https://github.com/comunica/comunica) is a SPARQL query
engine with an emphasis on modularity. To ensure completeness of query
results, it already includes actors such as quad pattern fragments
(qpf), or brqpf. We want to provide one for *continuation* queries. 


However, Comunica's documentation encourages forks. In this project,
we want to integrate our actors without drowning them in the mass of
already implemented actors. No forks.

## Build and run

```shell
yarn install

# It runs similarly to your good old Comunica
yarn run query-passage \
    http://localhost:3000/watdiv10M.jnl/passage \
    -f path/to/query --logLevel=debug > results.dat
```
