import {FragmentSelectorShape} from '@comunica/types';
import {Algebra} from 'sparqlalgebrajs';


/**
 * Raw handles its own set of operators that is subset of SPARQL 1.1.
 */
export class Shapes {

    /** For now, we accept everything **/
    public static readonly ALL: FragmentSelectorShape = {
        type: 'operation',
        operation: {operationType: 'wildcard'}
    };

    public static readonly RAW: FragmentSelectorShape = {
        type: 'disjunction',
        children: [
            {
                type: 'operation',
                operation: { operationType: 'type', type: Algebra.types.PROJECT },
            }, { // The least a server can do is being able to process a triple pattern
                type: 'operation',
                operation: { operationType: 'type', type: Algebra.types.PATTERN },
                // joinBindings: true,
                // filterBindings: true,
            }, { // We make heavy use of OFFSET in continuation queries
                type: 'operation',
                operation: { operationType: 'type', type: Algebra.types.SLICE },
            },
            { // BGP are easy to handle
                type: 'operation',
                operation: { operationType: 'type', type: Algebra.types.BGP },
            }, { // Join and BGP are alike
                type: 'operation',
                operation: { operationType: 'type', type: Algebra.types.JOIN },
            }, { // Bind are used to encode the context of execution
                type: 'operation',
                operation: { operationType: 'type', type: Algebra.types.EXTEND },
            },
            { // Union can be on server or not
                type: 'operation',
                operation: { operationType: 'type', type: Algebra.types.UNION },
            },
            { // TODO server must handle VALUES if they want to use binding-restricted
                 type: 'operation',
                 operation: { operationType: 'type', type: Algebra.types.VALUES },
            },
            {
                type: 'operation',
                operation: { operationType: 'type', type: Algebra.types.FILTER },
            },
            {
                type: 'operation',
                operation: { operationType: 'type', type: Algebra.types.LEFT_JOIN },
            },
            {
                type: 'operation',
                operation: { operationType: 'type', type: Algebra.types.GRAPH }
            },

        ],
    };

}

