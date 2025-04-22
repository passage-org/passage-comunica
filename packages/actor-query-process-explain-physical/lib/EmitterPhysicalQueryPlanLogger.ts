import {EventEmitter} from 'events';
import {IPhysicalQueryPlanLogger, IPlanNode} from "@comunica/types";

/**
 * A physical plan logger that also emits when calling the functions. This is important
 * to expose the changes over time, for external utilities. For instance, when using it
 * within the browser, one can retrieve the logger from the context, then update its view
 * depending on current nodes (alternatively, this could be done through reactive patterns,
 * at cost).
 */
export class EmitterPhysicalQueryPlanLogger extends EventEmitter implements IPhysicalQueryPlanLogger {

    private wrapped: IPhysicalQueryPlanLogger;

    public constructor(wrapped: IPhysicalQueryPlanLogger) {
        super();
        this.wrapped = wrapped;
    }

    public logOperation(logicalOperator: string,
                        physicalOperator: string | undefined,
                        node: any,
                        parentNode: any,
                        actor: string,
                        metadata: any,
    ): void {
        this.emit("init", [logicalOperator, physicalOperator, node, parentNode, actor, metadata]);
        return this.wrapped.logOperation(logicalOperator, physicalOperator, node, parentNode, actor, metadata);
    }

    public appendMetadata(node: any, metadata: any): void {
        this.emit("append", [node, metadata]);
        return this.wrapped.appendMetadata(node, metadata);
    }

    public stashChildren(node: any, filter: ((planNodeFilter: IPlanNode) => boolean) | undefined): void {
        this.emit("stash", [node, filter]);
        return this.wrapped.stashChildren(node, filter);
    }

    public unstashChild(node: any, parentNode: any): void {
        this.emit("unstash", node, parentNode);
        return this.wrapped.unstashChild(node, parentNode);
    }

    public toJson(): any {
        return this.wrapped.toJson();
    }

    public toCompactString(): string {
        return this.wrapped.toCompactString();
    }

}