import {BindingsFactory} from '@comunica/utils-bindings-factory';
import type {MediatorHttp} from '@comunica/bus-http';
import {KeysInitQuery} from '@comunica/context-entries';
import {ActionContextKey, Actor} from '@comunica/core';
import {MetadataValidationState} from '@comunica/utils-metadata';
import type {
    BindingsStream,
    ComunicaDataFactory,
    FragmentSelectorShape,
    IActionContext,
    IPhysicalQueryPlanLogger,
    IQueryBindingsOptions,
    IQuerySource,
    MetadataVariable,
} from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import {AsyncIterator, EmptyIterator, TransformIterator, wrap} from 'asynciterator';
import {SparqlEndpointFetcher} from 'fetch-sparql-endpoint';
import {LRUCache} from 'lru-cache';
import {Algebra, Factory, Util} from 'sparqlalgebrajs';
import type {BindMethod} from '@comunica/actor-query-source-identify-hypermedia-sparql';
import {QuerySourceSparql} from '@comunica/actor-query-source-identify-hypermedia-sparql';
import type {MediatorQueryProcess} from '@comunica/bus-query-process';
import {Shapes} from './Shapes';

/**
 * This actor is very much alike SPARQL. The difference is that it does not support
 * all kinds of SPARQL operators.
 */
export class QuerySourcePassage implements IQuerySource {

    protected static readonly SELECTOR_SHAPE: FragmentSelectorShape =
        process.env.SHAPE && process.env.SHAPE === 'tpf' ?
        Shapes.TPF : 
        process.env.SHAPE && process.env.SHAPE === 'brtpf' ?
        Shapes.BRTPF :
        process.env.SHAPE && process.env.SHAPE === 'no-union' ?
        Shapes.PASSAGE_NO_UNION : 
        Shapes.PASSAGE; // default

    public readonly referenceValue: string;
    private readonly url: string;
    private readonly context: IActionContext;
    private readonly mediatorHttp: MediatorHttp;
    private readonly bindMethod: BindMethod;
    private readonly countTimeout: number;
    private readonly dataFactory: ComunicaDataFactory;
    private readonly algebraFactory: Factory;
    private readonly bindingsFactory: BindingsFactory;
    
    private readonly mediatorQueryProcess: MediatorQueryProcess;

    private readonly endpointFetcher: SparqlEndpointFetcher;
    private readonly cache: LRUCache<string, RDF.QueryResultCardinality> | undefined;

    private lastSourceContext: IActionContext | undefined;

    public constructor(
        url: string,
        context: IActionContext,
        mediatorHttp: MediatorHttp,
        bindMethod: BindMethod,
        dataFactory: ComunicaDataFactory,
        algebraFactory: Factory,
        bindingsFactory: BindingsFactory,
        forceHttpGet: boolean,
        cacheSize: number,
        countTimeout: number,
        mediatorQueryProcess: MediatorQueryProcess
    ) {
        this.mediatorQueryProcess = mediatorQueryProcess;
        this.referenceValue = url;
        this.url = url;
        this.context = context;
        this.mediatorHttp = mediatorHttp;
        this.bindMethod = bindMethod;
        this.dataFactory = dataFactory;
        this.algebraFactory = algebraFactory;
        this.bindingsFactory = bindingsFactory;
        this.endpointFetcher = new SparqlEndpointFetcher({
            method: forceHttpGet ? 'GET' : 'POST',
            fetch: (input: Request | string, init?: RequestInit) => this.mediatorHttp.mediate(
                { input, init, context: this.lastSourceContext! },
            ),
            defaultHeaders: this.context.get(new ActionContextKey('headers')),
            prefixVariableQuestionMark: true,
            dataFactory,
        });
        this.cache = cacheSize > 0 ?
            new LRUCache<string, RDF.QueryResultCardinality>({ max: cacheSize }) :
            undefined;
        this.countTimeout = countTimeout;
    }

    public async getSelectorShape(): Promise<FragmentSelectorShape> {
        return this.context.get(new ActionContextKey("shape")) || QuerySourcePassage.SELECTOR_SHAPE;
    }

    public queryBindings(
        operationIn: Algebra.Operation,
        context: IActionContext,
        options?: IQueryBindingsOptions
    ): BindingsStream {
        // called twice: once to retrieve metadata; once to actually query
        // If bindings are passed, modify the operations
        let operationPromise: Promise<Algebra.Operation>;
        if (options?.joinBindings) {
            operationPromise = QuerySourceSparql.addBindingsToOperation(
                this.algebraFactory, this.bindMethod, operationIn, options.joinBindings);
        } else {
            operationPromise = Promise.resolve(operationIn);
        }

        const bindings: BindingsStream = new TransformIterator(async() => {
            const operation = await operationPromise;
            const selectQuery: string = QuerySourcePassage.toSelectQuery(context, operation, this.algebraFactory, options);
            const variables: RDF.Variable[] = Util.inScopeVariables(operation);
            const undefVariables = QuerySourceSparql.getOperationUndefs(operation);

            Actor.getContextLogger(context)?.info(`Asking for:\n${selectQuery}`);

            return this.queryBindingsRemote(operation, this.url, selectQuery, variables, context, undefVariables);
        }, { autoStart: false });

        this.attachMetadata(bindings, context, operationPromise, options); // actually important…
        
        return bindings;
    }


    /**
     * Actually important to attach metadata to this operation. Otherwise, metadata()
     * calls fail silently. This is mostly inspired by SPARQL Source's attach metadata.
     */
    protected attachMetadata(
        target: AsyncIterator<any>,
        context: IActionContext,
        operationPromise: Promise<Algebra.Operation>,
        options?: IQueryBindingsOptions,
    ) : void {
        let variablesCount: MetadataVariable[] = [];
        new Promise<Algebra.Operation>(async(resolve, reject) => {
            const operation = await operationPromise;
            const undefVariables = QuerySourceSparql.getOperationUndefs(operation);
            const variablesScoped = Util.inScopeVariables(operation);
            variablesCount = variablesScoped.map(variable => ({
                variable,
                canBeUndef: undefVariables.some(undefVariable => undefVariable.equals(variable)),
            }));
            return resolve(operation);
        }).then((operation) => {
            // ugly, we reprocess the query that is sent.
            const selectQuery: string = QuerySourcePassage.toSelectQuery(context, operation, this.algebraFactory, options);

            const metadata =  {
                state: new MetadataValidationState(),
                cardinality: { type: 'estimate', value: Number.POSITIVE_INFINITY },
                variables: variablesCount,
                query: selectQuery,
            };
            
            target.setProperty('metadata', metadata);

            // hence logged twice, since it's called during metadata retrieval, and actual execution
            QuerySourcePassage.initializeLogger(context, operation, selectQuery);
            context = context.set(KeysInitQuery.physicalQueryPlanNode, operation);
        });
    }
    
    public async queryBindingsRemote(
        operation: Algebra.Operation,
        endpoint: string,
        query: string,
        variables: RDF.Variable[],
        context: IActionContext,
        undefVariables: RDF.Variable[],
    ): Promise<BindingsStream> {
        QuerySourcePassage.updateStartTime(context, operation);
        const undefVariablesIndex: Set<string> = new Set();
        for (const undefVariable of undefVariables) {
            undefVariablesIndex.add(undefVariable.value);
        }

        // early stop set by an external hand on the shared context.
        const shouldStopShared : any = context.get(new ActionContextKey("abort"));
        const shouldStop : boolean = shouldStopShared && shouldStopShared.value ;
        if (shouldStop) {
            QuerySourcePassage.logError(context, operation, "The query has been aborted early.");
            return wrap<any>(new EmptyIterator());
        }

        this.lastSourceContext = this.context.merge(context);
        const rawStream = await this.endpointFetcher.fetchBindings(endpoint, query)
            .then((rs) => {
                QuerySourcePassage.updateFirstResultTime(context, operation);
                return Promise.resolve(rs); })
            .catch((e) => { QuerySourcePassage.logError(context, operation, e.message); });
        this.lastSourceContext = undefined;
        if (!rawStream) {return Promise.resolve(new EmptyIterator());} // <= continuation failed, we stop

        const it = wrap<any>(rawStream, { autoStart: false, maxBufferSize: Number.POSITIVE_INFINITY })
            .map<RDF.Bindings>((rawData: Record<string, RDF.Term>) => {
                // TODO fix this very ugly way to count the number of results…
                const nbResults : number = it.getProperty("nbResults") || 0;
                it.setProperty("nbResults", nbResults + 1);

                return this.bindingsFactory.bindings(
                    variables.map((variable) => {
                        const value = rawData[`?${variable.value}`];
                        if (!undefVariablesIndex.has(variable.value) && !value) {
                            Actor.getContextLogger(this.context)
                                ?.warn(`The endpoint ${endpoint} failed to provide a binding for ${variable.value}.`);
                        }
                        return <[RDF.Variable, RDF.Term]> [ variable, value ];
                    }).filter(([ _, v ]) => Boolean(v)))
            });

        const nextPromise: Promise<string|void> = new Promise(resolve => {
            // it and rawStream are handled differently. The metadata field
            // is only existing in the rawStream. But we consider the stream
            // done only when the wrapping stream is done.
            rawStream.on('metadata', async m => {
                Actor.getContextLogger(this.context)?.info(`Next query to get complete result:\n${m.next}`);
                resolve(m.next);
            });
            rawStream.on('end', async m => {
                resolve();
            })
            it.on('error', async e => {
                QuerySourcePassage.logError(context, operation, e.message); // error during the streaming itself, logged then done
                resolve();
            });
            it.on('end', async m => {
                QuerySourcePassage.updateDoneTime(context, operation);
                QuerySourcePassage.updateNbResults(context, operation, it.getProperty("nbResults") || 0);
            });
        });

        // comes from <https://www.npmjs.com/package/sparqljson-parse#advanced-metadata-entries>
        // const nextIt: BindingsStream = new TransformIterator(async ()=> {
        //    const next = await nextPromise;
        const nextIt: BindingsStream = wrap(nextPromise.then(next => {
            // const next : string|void = await nextPromise;
            if (!next) {
                // resolved once, if metadata exists, it triggers on it
                // next trigger on 'end', and not on 'metadata', therefore there are no next
                // query. The stream should end, so we put an empty binding iterator in queue.
                nextIt.close();
                return new EmptyIterator();
            }



            // we create a new operation to log it properly, even though it's the same
            const nextOperation = this.algebraFactory.createService(operation, this.dataFactory.namedNode(endpoint), false);
            QuerySourcePassage.initializeLogger(context, nextOperation, next);

            // TODO move this elsewhere, it exists in two locations in this function,
            //      which is one too many.
            // early stop set by an external hand on the shared context.
            const shouldStopShared : any = context.get(new ActionContextKey("abort"));
            const shouldStop : boolean = shouldStopShared && shouldStopShared.value ;
            if (shouldStop) {
                QuerySourcePassage.logError(context, nextOperation, "The query has been aborted early.");
                nextIt.close()
                return new EmptyIterator();
            }

            // TODO For now, we know that the endpoint sends continuation queries that
            //      are fully handled by itself. So we don't go full recursive by calling
            //      the full mediatorQueryProcess: this is much slower. Instead we recursively
            //      call this function: much simpler.
            return this.queryBindingsRemote(nextOperation, endpoint, next, variables, context, undefVariables);
            // const output : IActorQueryProcessOutput = await this.mediatorQueryProcess.mediate({
            //     context,
            //     query: next});
            // const results: IQueryOperationResultBindings = output.result as IQueryOperationResultBindings;
            // return results.bindingsStream; // subqueries must create binding streams for now.
        }));

        return it.append(nextIt);
    }

    public queryQuads(operation: Algebra.Operation, context: IActionContext): AsyncIterator<RDF.Quad> {
        throw new Error('queryQuads is not implemented in QuerySourcePassage.');
    }

    public queryBoolean(operation: Algebra.Ask, context: IActionContext): Promise<boolean> {
        throw new Error('queryBoolean is not implemented in QuerySourcePassage.');
    }

    public queryVoid(operation: Algebra.Update, context: IActionContext): Promise<void> {
        throw new Error('queryVoid is not implemented in QuerySourcePassage.');
    }
    
    public toString(): string {
        return `QuerySourcePassage(${this.url})`;
    }

    static toSelectQuery(context: IActionContext,
                         operation: Algebra.Operation,
                         algebraFactory: Factory,
                         options?: IQueryBindingsOptions): string {
        const variables: RDF.Variable[] = Util.inScopeVariables(operation);
        const queryString = context.get<string>(KeysInitQuery.queryString);
        const selectQuery: string = !options?.joinBindings && queryString ?
            queryString :
            operation.type === Algebra.types.PROJECT || operation.type === Algebra.types.SLICE ?
                QuerySourceSparql.operationToQuery(operation): // instead of operationToSelectQuery that would project+++
                QuerySourceSparql.operationToSelectQuery(algebraFactory, operation, variables);
        return selectQuery;
    }

    /* ********************* METADATA RELATED FUNCTIONS ********************** */

    /**
     * Initialize the physical plan logger with what we have.
     * @param context The execution context.
     * @param operation The service operation.
     * @param query The query that is actually sent to the endpoint, in string format.
     */
    public static initializeLogger(context: IActionContext, operation: Algebra.Operation, query: String) {
        const physicalQueryPlanLogger: IPhysicalQueryPlanLogger | undefined = context.get(KeysInitQuery.physicalQueryPlanLogger);
        if (!physicalQueryPlanLogger) return; // nothing to log to.

        const metadata =  {
            // cardinality: { type: 'estimate', value: Number.POSITIVE_INFINITY },
            variables: Util.inScopeVariables(operation).map(v => v.value),
            query: query,
        };

        physicalQueryPlanLogger.logOperation(
            Algebra.types.SERVICE, /* logical operation */
            undefined, /* physical operation */
            operation, /* node */
            context.get(KeysInitQuery.physicalQueryPlanNode), /* parentNode */
            "passage", /* actor */
            metadata, /* metadata */
        );
    }

    /**
     * Add the start time to the metadata to be logged.
     * @param context The execution context of the operation.
     * @param operation The operation to update.
     */
    public static updateStartTime(context: IActionContext, operation: Algebra.Operation) {
        const physicalQueryPlanLogger: IPhysicalQueryPlanLogger | undefined = context.get(KeysInitQuery.physicalQueryPlanLogger)
            || context.get(new ActionContextKey("physicalQueryPlanLogger"));
        if (physicalQueryPlanLogger) {
            operation.startAt = Date.now();
            physicalQueryPlanLogger.appendMetadata(operation, {startAt: operation.startAt});
        }
    }

    public static updateFirstResultTime(context:  IActionContext, operation: Algebra.Operation) {
        const physicalQueryPlanLogger: IPhysicalQueryPlanLogger | undefined = context.get(KeysInitQuery.physicalQueryPlanLogger)
            || context.get(new ActionContextKey("physicalQueryPlanLogger"));
        if (physicalQueryPlanLogger) {
            operation.firstResultAt = Date.now();
            operation.timeFirstResult = operation.firstResultAt - operation.startAt;
            physicalQueryPlanLogger.appendMetadata(operation, {firstResultAt: operation.firstResultAt});
            physicalQueryPlanLogger.appendMetadata(operation, {timeFirstResult: operation.timeFirstResult})
        }
    }



    /**
     * Add the done time to the metadata to be logged.
     * @param context The execution context of the operation.
     * @param operation The operation to update.
     */
    public static updateDoneTime(context: IActionContext, operation: Algebra.Operation) {
        const physicalQueryPlanLogger: IPhysicalQueryPlanLogger | undefined = context.get(KeysInitQuery.physicalQueryPlanLogger)
            || context.get(new ActionContextKey("physicalQueryPlanLogger"));
        if (physicalQueryPlanLogger) {
            operation.doneAt = Date.now();
            operation.timeLife = operation.doneAt - operation.startAt;
            physicalQueryPlanLogger.appendMetadata(operation, {doneAt: operation.doneAt});
            physicalQueryPlanLogger.appendMetadata(operation, {timeLife: operation.timeLife})
        }
    }

    /**
     * Add the number of results to the actual cardinality of the operation.
     * Careful: When there are multiple continuation queries. The scope of this cardinality
     * is each continuation query, not the lot.
     * @param context The execution context of the operation.
     * @param operation The operation.
     * @param nbResults The number of results retrieved by the iterator.
     */
    public static updateNbResults(context: IActionContext, operation: Algebra.Operation, nbResults: number) {
        const physicalQueryPlanLogger: IPhysicalQueryPlanLogger | undefined = context.get(KeysInitQuery.physicalQueryPlanLogger)
            || context.get(new ActionContextKey("physicalQueryPlanLogger"));
        if (physicalQueryPlanLogger) {
            operation.cardinalityReal = nbResults;
            physicalQueryPlanLogger.appendMetadata(operation, {cardinalityReal: nbResults})
        }
    }

    public static logError(context: IActionContext, operation: Algebra.Operation, message: string) {
        const physicalQueryPlanLogger: IPhysicalQueryPlanLogger | undefined = context.get(KeysInitQuery.physicalQueryPlanLogger)
            || context.get(new ActionContextKey("physicalQueryPlanLogger"));
        if (physicalQueryPlanLogger) {
            physicalQueryPlanLogger.appendMetadata(operation, {status: 'error', message})
        }
    }

}
