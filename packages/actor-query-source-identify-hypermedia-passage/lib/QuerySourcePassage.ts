import * as util from "util";

import type { BindingsFactory } from '@comunica/bindings-factory';
import type { MediatorHttp } from '@comunica/bus-http';
import { KeysInitQuery } from '@comunica/context-entries';
import { Actor } from '@comunica/core';
import { MetadataValidationState } from '@comunica/metadata';
import { Bindings, BindingsStream, FragmentSelectorShape,  MetadataBindings } from '@comunica/types';
import type { IActionContext, IQuerySource, IQueryBindingsOptions, IQueryOperationResultBindings } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';
import { wrap, TransformIterator, EmptyIterator, ArrayIterator } from 'asynciterator';
import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint';
import { LRUCache } from 'lru-cache';
import { DataFactory } from 'rdf-data-factory';
import { Algebra, Factory, toSparql, Util } from 'sparqlalgebrajs';
import type { BindMethod } from '@comunica/actor-query-source-identify-hypermedia-sparql';
import type { IActorQueryProcessOutput, MediatorQueryProcess } from '@comunica/bus-query-process';
import { ActorQueryOperation } from '@comunica/bus-query-operation';
import { QuerySourceSparql } from '@comunica/actor-query-source-identify-hypermedia-sparql';
import { Shapes } from './Shapes';

const AF = new Factory();
const DF = new DataFactory<RDF.BaseQuad>();

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
        Shapes.PASSAGE; // default

    public readonly referenceValue: string;
    private readonly url: string;
    private readonly context: IActionContext;
    private readonly mediatorHttp: MediatorHttp;
    private readonly bindMethod: BindMethod;
    private readonly countTimeout: number;
    private readonly bindingsFactory: BindingsFactory;
    
    private readonly mediatorQueryProcess: MediatorQueryProcess;

    private readonly endpointFetcher: SparqlEndpointFetcher;
    private readonly cache: LRUCache<string, RDF.QueryResultCardinality> | undefined;

    private lastSourceContext: IActionContext | undefined;

    public constructor(url: string, context: IActionContext, mediatorHttp: MediatorHttp,
                       bindMethod: BindMethod, bindingsFactory: BindingsFactory, forceHttpGet: boolean,
                       cacheSize: number, countTimeout: number,
                       mediatorQueryProcess: MediatorQueryProcess ) {
        this.mediatorQueryProcess = mediatorQueryProcess;
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
        return QuerySourcePassage.SELECTOR_SHAPE;
    }
    
    public queryBindings(operationIn: Algebra.Operation, context: IActionContext,
                         options?: IQueryBindingsOptions): BindingsStream {
        // If bindings are passed, modify the operations
        let operationPromise: Promise<Algebra.Operation>;
        if (options?.joinBindings) {
            operationPromise = QuerySourceSparql.addBindingsToOperation(this.bindMethod, operationIn, options.joinBindings);
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
                operation.type === Algebra.types.PROJECT ?
                QuerySourceSparql.operationToQuery(operation): // instead of operationToSelectQuery that would project+++
                QuerySourceSparql.operationToSelectQuery(operation, variables); // instead of operationToSelectQuery that would project+++
            const canContainUndefs = QuerySourceSparql.operationCanContainUndefs(operation);

            Actor.getContextLogger(context)?.info(`Asking for:\n${selectQuery}`);
            
            return this.queryBindingsRemote(this.url, selectQuery, variables, context, canContainUndefs);
        }, { autoStart: false });

        this.attachMetadata(bindings, context, operationPromise); // actually important…

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
    ) : void {
        let canContainUndefs = false;
        let variablesCount: RDF.Variable[] = [];
        new Promise<void>(async(resolve, reject) => {
            const operation = await operationPromise;
            variablesCount = Util.inScopeVariables(operation);
            canContainUndefs = QuerySourceSparql.operationCanContainUndefs(operation);
            return resolve();
        }).then(() => {
            target.setProperty(
                'metadata', {
                    state: new MetadataValidationState(),
                    // TODO figure out why `inner hash` does not work when emulated
                    // tpf (when infinite card)
                    cardinality: { type: 'estimate', value: Number.POSITIVE_INFINITY }, // Number.POSITIVE_INFINITY 
                    canContainUndefs,
                    variables: variablesCount,
                });
        });
    }
    
    
    /**
     * Send a SPARQL query to a SPARQL endpoint and retrieve its bindings as a stream.
     * In addition, it may get a `next` query if the results are not complete.
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

        const nextPromise: Promise<string|void> = new Promise(resolve => {
            rawStream.on('metadata', async m => {
                Actor.getContextLogger(context)?.info(`Next query to get complete result:\n${m.next}`);
                resolve(m.next);
            });
            rawStream.on('end', async m => { resolve(); });
        });
        
        // comes from <https://www.npmjs.com/package/sparqljson-parse#advanced-metadata-entries>
        let itbis: BindingsStream = new TransformIterator( async() => {
            const next : string|void = await nextPromise;
            if (!next) {
                // next trigger on 'end', and not on 'metadata', therefore there are no next
                // query. The stream should end, so we put an empty binding iterator in queue.
                return new ArrayIterator<RDF.Bindings>([], {autoStart: false});
            };
            const output : IActorQueryProcessOutput = await this.mediatorQueryProcess.mediate({context, query: next});
            const results: IQueryOperationResultBindings = output.result as IQueryOperationResultBindings;
            return results.bindingsStream;
        }, { autoStart: false });

        return it.append(itbis);
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
}
