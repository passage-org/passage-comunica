import {type ActorInitQueryBase, QueryEngineBase} from "@comunica/actor-init-query";
import type {IActionContext, IQueryOperationResult, QueryFormatType} from "@comunica/types";
import {ActionContext} from "@comunica/core";
import type * as RDF from "@rdfjs/types";

export class QueryEngineBaseExtended extends QueryEngineBase {

    private readonly actorInitQueryDup : ActorInitQueryBase;

    public constructor(actorInitQuery: ActorInitQueryBase) {
        super(actorInitQuery);
        this.actorInitQueryDup = actorInitQuery;
    }

    /**
     * Evaluate *AND* explain the given query.
     * @param query A query string or algebra.
     * @param context An optional query context.
     * @return {Promise<QueryType | IQueryExplained>} TODO change return type to a union of both
     */
    public async queryAndExplain<QueryFormatTypeInner extends QueryFormatType>(
        query: QueryFormatTypeInner,
        context?: QueryFormatTypeInner extends string ? RDF.QueryStringContext : RDF.QueryAlgebraContext,
    ): Promise<any> {
        const actionContext: IActionContext = ActionContext.ensureActionContext(context);

        // Invalidate caches if cache argument is set to false
        // if (actionContext.get(KeysInitQuery.invalidateCache)) {
        //    await this.invalidateHttpCache();
        // }

        // Invoke query process
        const { result } = await this.actorInitQueryDup.mediatorQueryProcess.mediate({ query, context: actionContext });
        /* if ('explain' in result) {
           return result;
        } */
        result.type = 'bindings';
        const resultBindings = QueryEngineBase.internalToFinalResult(result as IQueryOperationResult);
        result.type = 'physical'; // SOOOOO ugly!
        return {...result, ...resultBindings}
    }

}