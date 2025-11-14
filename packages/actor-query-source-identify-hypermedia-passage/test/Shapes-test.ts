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
  })
})
           
