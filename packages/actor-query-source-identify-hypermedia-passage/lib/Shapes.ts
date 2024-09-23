import { FragmentSelectorShape } from '@comunica/types';
import { Algebra } from 'sparqlalgebrajs';


/**
 * Passage handle its own set of operators that is subset of SPARQL 1.1.
 * But it can also emulate other approaches such as TPF, and BRTPF.
 */
export class Shapes {

    // Only triple pattern are handled. Pagination is done by using
    // SLICE, i.e., OFFSET.
    public static readonly TPF: FragmentSelectorShape = {
        type: 'disjunction',
        children: [
            // TODO when comunica fixes this, remove the comments
            // This 'project' clashes with exhaustive source optimizer that do
            // not recursively check the possible operators of the interface.
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
                operation: { operationType: 'type', type: Algebra.types.SLICE }
            }
        ]
    };


    public static readonly BRTPF: FragmentSelectorShape = {
        type: 'disjunction',
        children: [
            {
                type: 'operation',
                operation: { operationType: 'type', type: Algebra.types.PROJECT },
            }, { // The least a server can do is being able to process a triple pattern
                type: 'operation',
                operation: { operationType: 'type', type: Algebra.types.PATTERN },
                joinBindings: true,
                filterBindings: true, // actually inject bindings
            }, { // We make heavy use of OFFSET in continuation queries
                type: 'operation',
                operation: { operationType: 'type', type: Algebra.types.SLICE },
            },
        ]
    }; 


    public static readonly PASSAGE: FragmentSelectorShape = {
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
            // { // TODO server must handle VALUES if they want to use binding-restricted
            //     type: 'operation',
            //     operation: { operationType: 'type', type: Algebra.types.VALUES },
            // },
        ],
    };


    public static readonly PASSAGE_NO_UNION: FragmentSelectorShape = {
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
            // { // TODO server must handle VALUES if they want to use binding-restricted
            //     type: 'operation',
            //     operation: { operationType: 'type', type: Algebra.types.VALUES },
            // },
        ],
    };


}

