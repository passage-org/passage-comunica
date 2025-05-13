import {QueryEngineBase} from '@comunica/actor-init-query';
import * as RdfString from 'rdf-string';
import * as passage from './passage-comunica-engine.js';

const PassageFactory = function() {
    return new QueryEngineBase(passage());
};

const Passage = {
    PassageFactory: PassageFactory,
    RdfString: RdfString,
};

export default Passage;
