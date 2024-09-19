import * as util from "util";

import type {
    IActionOptimizeQueryOperation,
    IActorOptimizeQueryOperationOutput,
    IActorOptimizeQueryOperationArgs,
} from '@comunica/bus-optimize-query-operation';
import { ActorOptimizeQueryOperation } from '@comunica/bus-optimize-query-operation';
import { ActorQueryOperation } from '@comunica/bus-query-operation';
import { getDataDestinationValue } from '@comunica/bus-rdf-update-quads';
import { KeysInitQuery, KeysQueryOperation, KeysRdfUpdateQuads } from '@comunica/context-entries';
import type { IActorTest } from '@comunica/core';
import type { IDataDestination, IQuerySourceWrapper, FragmentSelectorShape } from '@comunica/types';
import { Algebra, Util } from 'sparqlalgebrajs';

/**
 * Assign the largest fragment of operations that is handled by a source.
 */
export class ActorOptimizeQueryOperationAssignLargestSource extends ActorOptimizeQueryOperation {
    public constructor(args: IActorOptimizeQueryOperationArgs) {
        super(args);

        // MONKEY PATCH, remove this when comunica handles it
        (ActorQueryOperation as any).doesShapeAcceptOperation = function(
            shape: FragmentSelectorShape,
            operation: Algebra.Operation,
            options?: {
                joinBindings?: boolean;
                filterBindings?: boolean;
            },): boolean {
            if (shape.type === 'conjunction') {
                return shape.children.every(child => ActorQueryOperation.doesShapeAcceptOperation(child, operation, options));
            }
            if (shape.type === 'disjunction') {
                return shape.children.some(child => ActorQueryOperation.doesShapeAcceptOperation(child, operation, options));
            }
            if (shape.type === 'arity') {
                return ActorQueryOperation.doesShapeAcceptOperation(shape.child, operation, options);
            }

            if ((options?.joinBindings && !shape.joinBindings) ?? (options?.filterBindings && !shape.filterBindings)) {
                return false;
            }

            if (shape.operation.operationType === 'type') {
                return shape.operation.type === operation.type;
            }
            return shape.operation.pattern.type === operation.type;
        }; // end MONKEY PATCH

    }

    public async test(_action: IActionOptimizeQueryOperation): Promise<IActorTest> {
        return true;
    }

    public async run(action: IActionOptimizeQueryOperation): Promise<IActorOptimizeQueryOperationOutput> {
        const sources: IQuerySourceWrapper[] = action.context.get(KeysQueryOperation.querySources) ?? [];
        if (sources.length === 0) {
            return { operation: action.operation, context: action.context };
        }
        
        if (sources.length > 1) {
            throw new Error("Multiple sources not yet supported by ActorOptimizeQueryOperationAssignLargestSource.");
        };
        
        const sourceWrapper = sources[0];
        const destination: IDataDestination | undefined = action.context.get(KeysRdfUpdateQuads.destination);
        
        const shape = await sourceWrapper.source.getSelectorShape(action.context);
        const largest = this.assignLargest(action.operation, sources, shape)
        
        return {
            operation: largest,
            context: action.context.delete(KeysInitQuery.queryString).set({name: "root"}, largest),
        };
    }

    
    public recursiveIsSupported (operation: Algebra.Operation, shape: FragmentSelectorShape) : boolean {
        if (!ActorOptimizeQueryOperationAssignLargestSource.doesShapeAcceptOperation(shape, operation)) {
            return false;
        };

        const self = this;
        if (operation.input?.type) {
            return this.recursiveIsSupported(operation.input, shape);
        } else if (operation.input) {
            return operation.input.every((i: Algebra.Operation) => self.recursiveIsSupported(i, shape));
        }
        
        if (operation.patterns) {
            return operation.patterns.every((pattern: Algebra.Operation) => self.recursiveIsSupported(pattern, shape));
        }
        
        return true;
    }


    /**
     * Check if the given shape accepts the given query operation.
     * @param shape A shape to test the query operation against.
     * @param operation A query operation to test.
     * @param options Additional options to consider.
     * @param options.joinBindings If additional bindings will be pushed down to the source for joining.
     * @param options.filterBindings If additional bindings will be pushed down to the source for filtering.
     */
    public static doesShapeAcceptOperation(
        shape: FragmentSelectorShape,
        operation: Algebra.Operation,
        options?: {
            joinBindings?: boolean;
            filterBindings?: boolean;
        },
    ): boolean {
        if (shape.type === 'conjunction') {
            return shape.children.every(child => ActorOptimizeQueryOperationAssignLargestSource.doesShapeAcceptOperation(child, operation, options));
        }
        if (shape.type === 'disjunction') {
            return shape.children.some(child => ActorOptimizeQueryOperationAssignLargestSource.doesShapeAcceptOperation(child, operation, options));
        }
        if (shape.type === 'arity') {
            return ActorOptimizeQueryOperationAssignLargestSource.doesShapeAcceptOperation(shape.child, operation, options);
        }

        if ((options?.joinBindings && !shape.joinBindings) ?? (options?.filterBindings && !shape.filterBindings)) {
            return false;
        }
        
        if (shape.operation.operationType === 'type') {
            return shape.operation.type === operation.type;
        }
        return shape.operation.pattern.type === operation.type;
    }



    /**
     * Assign the given sources to the leaves in the given query operation.
     * Leaves will be wrapped in a union operation and duplicated for every source.
     * The input operation will not be modified.
     * @param operation The input operation.
     * @param sources The sources to assign.
     */
    public assignLargest(operation: Algebra.Operation,
                         sources: IQuerySourceWrapper[],
                         shape: FragmentSelectorShape): Algebra.Operation {

        const shouldAssign = this.recursiveIsSupported(operation, shape);

        if (shouldAssign) {
            operation =  ActorQueryOperation.assignOperationSource(operation, sources[0]);
        };

        if (operation.input?.type) {
            operation.input = this.assignLargest(operation.input, sources, shape);
        } else if (operation.input) {
            for (let i = 0; i < operation.input.length ; ++i) {
                operation.input[i] = this.assignLargest(operation.input[i], sources, shape);
            };
        };
        
        if (operation.patterns) {
            for (let i = 0; i < operation.patterns.length ; ++i) {
                operation.patterns[i] = this.assignLargest(operation.patterns[i], sources, shape);
            };
        };

        return operation;
    }
}
