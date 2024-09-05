import type { BindingsFactory } from '@comunica/bindings-factory';
import type { MediatorHttp } from '@comunica/bus-http';
import { KeysInitQuery } from '@comunica/context-entries';
import { Actor } from '@comunica/core';
import { MetadataValidationState } from '@comunica/metadata';
import { Bindings, BindingsStream, FragmentSelectorShape,  MetadataBindings } from '@comunica/types';
import type { IActionContext, IQuerySource, IQueryBindingsOptions } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';
import { wrap, union, TransformIterator } from 'asynciterator';
import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint';
import { LRUCache } from 'lru-cache';
import { DataFactory } from 'rdf-data-factory';
import { Algebra, Factory, toSparql, Util } from 'sparqlalgebrajs';
import type { BindMethod } from '@comunica/actor-query-source-identify-hypermedia-sparql';
import type { MediatorQueryParse } from '@comunica/bus-query-parse';

const AF = new Factory();
const DF = new DataFactory<RDF.BaseQuad>();
const VAR_COUNT = DF.variable('count');
const COUNT_INFINITY: RDF.QueryResultCardinality = { type: 'estimate', value: Number.POSITIVE_INFINITY };

/**
 * This actor is very much alike SPARQL. The difference is that it does not support
 * all kinds of SPARQL operators.
 */
export class QuerySourceSage implements IQuerySource {
    // TODO change the selector shape
    protected static readonly SELECTOR_SHAPE: FragmentSelectorShape = {
        type: 'disjunction',
        children: [
            {
                type: 'operation',
                operation: { operationType: 'type', type: Algebra.types.PROJECT },
                joinBindings: true,
            },
            {
                type: 'operation',
                operation: { operationType: 'type', type: Algebra.types.CONSTRUCT },
            },
            {
                type: 'operation',
                operation: { operationType: 'type', type: Algebra.types.DESCRIBE },
            },
            {
                type: 'operation',
                operation: { operationType: 'type', type: Algebra.types.ASK },
            },
            {
                type: 'operation',
                operation: { operationType: 'type', type: Algebra.types.COMPOSITE_UPDATE },
            },
        ],
    };

    public readonly referenceValue: string;
    private readonly url: string;
    private readonly context: IActionContext;
    private readonly mediatorHttp: MediatorHttp;
    private readonly bindMethod: BindMethod;
    private readonly countTimeout: number;
    private readonly bindingsFactory: BindingsFactory;
    
    private readonly mediatorQueryParse: MediatorQueryParse;

    private readonly endpointFetcher: SparqlEndpointFetcher;
    private readonly cache: LRUCache<string, RDF.QueryResultCardinality> | undefined;

    private lastSourceContext: IActionContext | undefined;

    public constructor(url: string, context: IActionContext, mediatorHttp: MediatorHttp,
                       bindMethod: BindMethod, bindingsFactory: BindingsFactory, forceHttpGet: boolean,
                       cacheSize: number, countTimeout: number,
                       mediatorQueryParse: MediatorQueryParse ) {
        this.mediatorQueryParse = mediatorQueryParse;
        this.referenceValue = url;
        this.url = url;
        this.context = context;
        this.mediatorHttp = mediatorHttp;
        this.bindMethod = bindMethod;
        this.bindingsFactory = bindingsFactory;
        this.endpointFetcher = new SparqlEndpointFetcher({
            method: forceHttpGet ? 'GET' : 'POST',
            fetch: (input: Request | string, init?: RequestInit) => this.mediatorHttp.mediate(
                { input, init, context: this.lastSourceContext! },
            ),
            prefixVariableQuestionMark: true,
        });
        this.cache = cacheSize > 0 ?
            new LRUCache<string, RDF.QueryResultCardinality>({ max: cacheSize }) :
            undefined;
        this.countTimeout = countTimeout;
    }

    public async getSelectorShape(): Promise<FragmentSelectorShape> {
        return QuerySourceSage.SELECTOR_SHAPE;
    }

    public queryBindings(operationIn: Algebra.Operation, context: IActionContext,
                         options?: IQueryBindingsOptions): BindingsStream {
        // If bindings are passed, modify the operations
        let operationPromise: Promise<Algebra.Operation>;
        if (options?.joinBindings) {
            operationPromise = QuerySourceSage.addBindingsToOperation(this.bindMethod, operationIn, options.joinBindings);
        } else {
            operationPromise = Promise.resolve(operationIn);
        }

        const bindings: BindingsStream = new TransformIterator(async() => {
            // Prepare queries
            const operation = await operationPromise;
            const variables: RDF.Variable[] = Util.inScopeVariables(operation);
            const queryString = context.get<string>(KeysInitQuery.queryString);
            const selectQuery: string = !options?.joinBindings && queryString ?
                queryString :
                QuerySourceSage.operationToSelectQuery(operation, variables);
            const canContainUndefs = QuerySourceSage.operationCanContainUndefs(operation);

            return this.queryBindingsRemote(this.url, selectQuery, variables, context, canContainUndefs);
        }, { autoStart: false });

        // commented out for now: this is parasite
        // this.attachMetadata(bindings, context, operationPromise);

        return bindings;
    }

    public queryQuads(operation: Algebra.Operation, context: IActionContext): AsyncIterator<RDF.Quad> {
        this.lastSourceContext = this.context.merge(context);
        const rawStream = this.endpointFetcher.fetchTriples(
            this.url,
            context.get(KeysInitQuery.queryString) ?? QuerySourceSage.operationToQuery(operation),
        );
        this.lastSourceContext = undefined;
        const quads = wrap<any>(rawStream, { autoStart: false, maxBufferSize: Number.POSITIVE_INFINITY });
        this.attachMetadata(quads, context, Promise.resolve(operation.input));
        return quads;
    }

    public queryBoolean(operation: Algebra.Ask, context: IActionContext): Promise<boolean> {
        this.lastSourceContext = this.context.merge(context);
        const promise = this.endpointFetcher.fetchAsk(
            this.url,
            context.get(KeysInitQuery.queryString) ?? QuerySourceSage.operationToQuery(operation),
        );
        this.lastSourceContext = undefined;
        return promise;
    }

    public queryVoid(operation: Algebra.Update, context: IActionContext): Promise<void> {
        this.lastSourceContext = this.context.merge(context);
        const promise = this.endpointFetcher.fetchUpdate(
            this.url,
            context.get(KeysInitQuery.queryString) ?? QuerySourceSage.operationToQuery(operation),
        );
        this.lastSourceContext = undefined;
        return promise;
    }

    protected attachMetadata(target: AsyncIterator<any>, context: IActionContext,
                             operationPromise: Promise<Algebra.Operation>): void {
        // Emit metadata containing the estimated count
        let variablesCount: RDF.Variable[] = [];
        let canContainUndefs = false;
        // eslint-disable-next-line no-async-promise-executor,ts/no-misused-promises
        new Promise<RDF.QueryResultCardinality>(async(resolve, reject) => {
            // Prepare queries
            let countQuery: string;
            try {
                const operation = await operationPromise;
                variablesCount = Util.inScopeVariables(operation);
                countQuery = QuerySourceSage.operationToCountQuery(operation);
                canContainUndefs = QuerySourceSage.operationCanContainUndefs(operation);

                const cachedCardinality = this.cache?.get(countQuery);
                if (cachedCardinality !== undefined) {
                    return resolve(cachedCardinality);
                }

                const timeoutHandler = setTimeout(() => resolve(COUNT_INFINITY), this.countTimeout);
                const bindingsStream: BindingsStream = await this
                    .queryBindingsRemote(this.url, countQuery, [ VAR_COUNT ], context, false);
                bindingsStream.on('data', (bindings: Bindings) => {
                    clearTimeout(timeoutHandler);
                    const count = bindings.get(VAR_COUNT);
                    const cardinality: RDF.QueryResultCardinality = { type: 'estimate', value: Number.POSITIVE_INFINITY };
                    if (count) {
                        const cardinalityValue: number = Number.parseInt(count.value, 10);
                        if (!Number.isNaN(cardinalityValue)) {
                            cardinality.type = 'exact';
                            cardinality.value = cardinalityValue;
                            this.cache?.set(countQuery, cardinality);
                        }
                    }
                    return resolve(cardinality);
                });
                bindingsStream.on('error', () => {
                    clearTimeout(timeoutHandler);
                    resolve(COUNT_INFINITY);
                });
                bindingsStream.on('end', () => {
                    clearTimeout(timeoutHandler);
                    resolve(COUNT_INFINITY);
                });
            } catch (error: unknown) {
                return reject(error);
            }
        })
            .then((cardinality) => {
                target.setProperty('metadata', {
                    state: new MetadataValidationState(),
                    cardinality,
                    canContainUndefs,
                    variables: variablesCount,
                });
            })
            .catch(() => target.setProperty('metadata', {
                state: new MetadataValidationState(),
                cardinality: COUNT_INFINITY,
                canContainUndefs,
                variables: variablesCount,
            }));
    }

    /**
     * Create an operation that includes the bindings from the given bindings stream.
     * @param bindMethod A method for adding bindings to an operation.
     * @param operation The operation to bind to.
     * @param addBindings The bindings to add.
     * @param addBindings.bindings The bindings stream.
     * @param addBindings.metadata The bindings metadata.
     */
    public static async addBindingsToOperation(bindMethod: BindMethod, operation: Algebra.Operation,
                                               addBindings: { bindings: BindingsStream; metadata: MetadataBindings },
                                              ): Promise<Algebra.Operation> {
        const bindings = await addBindings.bindings.toArray();

        switch (bindMethod) {
            case 'values':
                return AF.createJoin([
                    AF.createValues(
                        addBindings.metadata.variables,
                        bindings.map(binding =>
                            Object.fromEntries([ ...binding ]
                                                   .map(([ key, value ]) => [ `?${key.value}`, <RDF.Literal | RDF.NamedNode> value ]))),
                    ),
                    operation,
                ], false);
            case 'union': { throw new Error('Not implemented yet: "union" case'); }
            case 'filter': { throw new Error('Not implemented yet: "filter" case'); }
        }
    }

    /**
     * Convert an operation to a select query for this pattern.
     * @param {Algebra.Operation} operation A query operation.
     * @param {RDF.Variable[]} variables The variables in scope for the operation.
     * @return {string} A select query string.
     */
    public static operationToSelectQuery(operation: Algebra.Operation, variables: RDF.Variable[]): string {
        return QuerySourceSage.operationToQuery(AF.createProject(operation, variables));
    }

    /**
     * Convert an operation to a count query for the number of matching triples for this pattern.
     * @param {Algebra.Operation} operation A query operation.
     * @return {string} A count query string.
     */
    public static operationToCountQuery(operation: Algebra.Operation): string {
        return QuerySourceSage.operationToQuery(AF.createProject(
            AF.createExtend(
                AF.createGroup(
                    operation,
                    [],
                    [ AF.createBoundAggregate(
                        DF.variable('var0'),
                        'count',
                        AF.createWildcardExpression(),
                        false,
                    ) ],
                ),
                DF.variable('count'),
                AF.createTermExpression(DF.variable('var0')),
            ),
            [ DF.variable('count') ],
        ));
    }

    /**
     * Convert an operation to a query for this pattern.
     * @param {Algebra.Operation} operation A query operation.
     * @return {string} A query string.
     */
    public static operationToQuery(operation: Algebra.Operation): string {
        return toSparql(operation, { sparqlStar: true });
    }

    /**
     * Check if the given operation may produce undefined values.
     * @param operation
     */
    public static operationCanContainUndefs(operation: Algebra.Operation): boolean {
        let canContainUndefs = false;
        Util.recurseOperation(operation, {
            leftjoin(): boolean {
                canContainUndefs = true;
                return false;
            },
            values(values: Algebra.Values): boolean {
                canContainUndefs = values.bindings.some(bindings => values.variables.some(variable => !(`?${variable.value}` in bindings)));
                return false;
            },
            union(union: Algebra.Union): boolean {
                // Determine variables in scope of the union branches
                const scopedVariables = union.input
                    .map(Util.inScopeVariables)
                    .map(variables => variables.map(v => v.value))
                    .map(variables => variables.sort((a, b) => a.localeCompare(b)))
                    .map(variables => variables.join(','));

                // If not all scoped variables in union branches are equal, then we definitely can have undefs
                if (!scopedVariables.every(val => val === scopedVariables[0])) {
                    canContainUndefs = true;
                    return false;
                }

                return true;
            },
        });
        return canContainUndefs;
    }

    /**
     * Send a SPARQL query to a SPARQL endpoint and retrieve its bindings as a stream.
     * @param {string} endpoint A SPARQL endpoint URL.
     * @param {string} query A SPARQL query string.
     * @param {RDF.Variable[]} variables The expected variables.
     * @param {IActionContext} context The source context.
     * @param canContainUndefs If the operation may contain undefined variables.
     * @return {BindingsStream} A stream of bindings.
     */
    public async queryBindingsRemote(endpoint: string, query: string, variables: RDF.Variable[],
                                     context: IActionContext, canContainUndefs: boolean,
                                    ): Promise<BindingsStream> {
        this.lastSourceContext = this.context.merge(context);
        const rawStream = await this.endpointFetcher.fetchBindings(endpoint, query);
        this.lastSourceContext = undefined;

        const it = wrap<any>(rawStream, { autoStart: false, maxBufferSize: Number.POSITIVE_INFINITY })
            .map<RDF.Bindings>((rawData: Record<string, RDF.Term>) => this.bindingsFactory.bindings(
                variables.map((variable) => {
                    const value = rawData[`?${variable.value}`];
                    if (!canContainUndefs && !value) {
                        Actor.getContextLogger(this.context)
                            ?.warn(`The endpoint ${endpoint} failed to provide a binding for ${variable.value}.`);
                    }
                    return <[RDF.Variable, RDF.Term]> [ variable, value ];
                }).filter(([ _, v ]) => Boolean(v))));

        const nextPromise: Promise<string> = new Promise(resolve => {
            rawStream.on('metadata', async m => { // (TODO set property should be on the wrapped thing of `it`)
                //const parsed = await this.mediatorQueryParse.mediate({context, query: next});
                Actor.getContextLogger(this.context)?.info(`Next query to get complete result:\n${m.next}`);
                resolve(m.next);
            })});
        
        // comes from <https://www.npmjs.com/package/sparqljson-parse#advanced-metadata-entries>
        let itbis: BindingsStream = new TransformIterator( async() => {
            const next : string = await nextPromise;
            return this.queryBindingsRemote(endpoint, next, variables, context, canContainUndefs);
        }, { autoStart: false });
        
        return it.append(itbis);
    }

    public toString(): string {
        return `QuerySourceSage(${this.url})`;
    }
}
