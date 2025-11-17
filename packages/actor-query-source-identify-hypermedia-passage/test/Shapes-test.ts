import type { FragmentSelectorShape } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import { Algebra, Factory, translate } from 'sparqlalgebrajs';
import { doesShapeAcceptOperation } from '@comunica/utils-query-operation';
import { Shapes } from '../lib/Shapes';


describe('Shapes', () => {
  describe('PASSAGE', () => {
    it('should accept spo operations', () => {
      expect(doesShapeAcceptOperation(
        Shapes.PASSAGE,
        translate('SELECT * WHERE { ?s ?p ?o }')
      )).toBeTruthy();
    })
    it('should accept bgp operations', () => {
      expect(doesShapeAcceptOperation(
        Shapes.PASSAGE,
        translate('SELECT * WHERE { ?person <http://own> ?animal . ?animal <http://species> ?species }')
      )).toBeTruthy();
    })

    it('should transform the sequence path so it gets accepted', () => {
      expect(doesShapeAcceptOperation(
        Shapes.PASSAGE,
        translate('SELECT * WHERE { ?person <http://own>/<http://species> ?species }')
      )).toBeTruthy();
    })

    
    it('does not handle group by queries yet', () => {
      expect(doesShapeAcceptOperation(
        Shapes.PASSAGE,
        translate('SELECT ?p WHERE { ?p <http://own> ?a } GROUP BY ?p')
      )).toBeFalsy();
    })
    it('does not handle property path yet', () => {
      expect(doesShapeAcceptOperation(
        Shapes.PASSAGE,
        translate('SELECT * WHERE { ?person <http://own>+ ?species }')
      )).toBeFalsy();
    })

    // TODO: Eventually, we would like to identify too large operations
    //       to keep them on the smart-client. The trade-off being that
    //       the Passage server indeed does additional computation, but
    //       at least, the FILTERs comprising thousands of checks are not
    //       doing round-trips in the network.
    //       However, not sure it's possible with the Shapes as for now.
    //       Possibly possible with the parser that should arrive in
    //       Comunica 5.

    
    //     it('should not accept since the values is too large', () => {
    //       expect(doesShapeAcceptOperation(
    //         Shapes.PASSAGE,
    //         (() => { const query = translate(`
    // SELECT * WHERE {
    // VALUES ?animal { "turtoise" "fox" "eagle" "dog" "snake" }
    // ?person <http://own> ?animal
    // }`); console.log(query.input); return query; })()
    //       )).toBeFalsy()
    //     })

    
    //     it('should not accept since the filter is too large', () => {
    //       expect(doesShapeAcceptOperation(
    //         Shapes.PASSAGE,
    //         (() => { const query = translate(`
    // SELECT * WHERE {
    // ?person <http://own> ?animal
    // FILTER (?animal != "turtoise" &&
    // ?animal != "fox" &&
    // ?animal != "eagle" &&
    // ?animal != "dog" &&
    // ?animal != "snake")
    // }`); console.log(query); return query; })()
    //       )).toBeFalsy();
    //     })
    
  })
})
           
