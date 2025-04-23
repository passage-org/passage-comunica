# Actor query process sequential recursive



Very simple change performed on the [`actor-query-process-sequential`](https://github.com/comunica/comunica/tree/master/packages/actor-query-process-sequential).
In the `parse` function, when the context was already initialized, we don't call initialize again…

Without it, the physical plan may look like the following where the same source
appears twice: 

```
slice src:0
  service (p) src:0
  service (p) src:0 cardReal:807532 timeLife:6,749ms
  project (p) src:1
    service (p) src:1
    service (p) src:1 cardReal:192468 timeLife:2,192ms

sources:
  0: QuerySourceHypermedia(https://10-54-2-226.gcp.glicid.fr/watdiv/passage)(SkolemID:0)
  1: QuerySourceHypermedia(https://10-54-2-226.gcp.glicid.fr/watdiv/passage)(SkolemID:0)(SkolemID:0)
✨  Done in 21.18s.
```
