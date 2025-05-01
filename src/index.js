import * as passage from './passage-comunica-engine.js';
import {QueryEngineBase} from '@comunica/actor-init-query';
import RdfString from 'rdf-string';

const PassageFactory = function() {
    return new QueryEngineBase(passage());
}

const Passage = {
    PassageFactory: PassageFactory,
    RdfString: RdfString,
};

export default Passage;
