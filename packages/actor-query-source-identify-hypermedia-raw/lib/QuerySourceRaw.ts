import type {MediatorQuerySerialize} from '@comunica/bus-query-serialize';
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
import {AsyncIterator, TransformIterator, wrap} from 'asynciterator';
import {SparqlEndpointFetcher} from 'fetch-sparql-endpoint';
import {LRUCache} from 'lru-cache';
import type {AlgebraFactory} from '@comunica/utils-algebra';
import {Algebra, algebraUtils, isKnownOperation} from '@comunica/utils-algebra';
import {BindingsFactory} from '@comunica/utils-bindings-factory';
import type {BindMethod} from '@comunica/actor-query-source-identify-hypermedia-sparql';
import {QuerySourceSparql} from '@comunica/actor-query-source-identify-hypermedia-sparql';
import type {MediatorQueryProcess} from '@comunica/bus-query-process';
import {Shapes} from './Shapes';

/**
 * This actor is very much alike SPARQL. The difference is that it does not support
 * all kinds of SPARQL operators.
 */
export class QuerySourceRaw implements IQuerySource {

  protected static readonly SELECTOR_SHAPE: FragmentSelectorShape = Shapes.ALL; // default

  public readonly referenceValue: string;
  private readonly url: string;
  private readonly context: IActionContext;
  private readonly mediatorHttp: MediatorHttp;
  private readonly mediatorQuerySerialize: MediatorQuerySerialize;
  private readonly bindMethod: BindMethod;
  private readonly countTimeout: number;
  private readonly dataFactory: ComunicaDataFactory;
  private readonly algebraFactory: AlgebraFactory;
  private readonly bindingsFactory: BindingsFactory;
  
  private readonly mediatorQueryProcess: MediatorQueryProcess;

  private readonly endpointFetcher: SparqlEndpointFetcher;
  private readonly cache: LRUCache<string, RDF.QueryResultCardinality> | undefined;

  private lastSourceContext: IActionContext | undefined;

  public constructor(
    url: string,
    context: IActionContext,
    mediatorHttp: MediatorHttp,
    mediatorQuerySerialize: MediatorQuerySerialize,
    bindMethod: BindMethod,
    dataFactory: ComunicaDataFactory,
    algebraFactory: AlgebraFactory,
    bindingsFactory: BindingsFactory,
    forceHttpGet: boolean,
    cacheSize: number,
    countTimeout: number,
    // mediatorQueryProcess: MediatorQueryProcess
    metadata: Record<string, any>,
  ) {
    // this.mediatorQueryProcess = mediatorQueryProcess;
    this.referenceValue = url;
    this.url = url;
    this.context = context;
    this.mediatorHttp = mediatorHttp;
    this.bindMethod = bindMethod;
    this.dataFactory = dataFactory;
    this.algebraFactory = algebraFactory;

    // Endpoints advertise support for the HTTP QUERY method (RFC 10008) via the Accept-Query header,
    // which lets us send the query in the request body without the side effects of a POST.
    let method: 'GET' | 'POST' | 'QUERY' = 'POST';
    if (forceHttpGet) {
      method = 'GET';
    } else if (metadata.queryAccepted?.includes(QuerySourceSparql.MEDIATYPE_SPARQL_QUERY)) {
      method = 'QUERY';
    }

    this.endpointFetcher = new SparqlEndpointFetcher({
      method,
      prefixVariableQuestionMark: true,
      dataFactory,
      forceGetIfUrlLengthBelow: 0, // TODO: put this as an argument like in comunica
      fetch: (input: Request | string, init?: RequestInit) => this.mediatorHttp.mediate(
        { input, init, context: this.lastSourceContext! },
      ),
      defaultHeaders: this.context.get(new ActionContextKey('headers')),
    });

    this.cache = cacheSize > 0 ?
      new LRUCache<string, RDF.QueryResultCardinality>({ max: cacheSize }) :
      undefined;
    this.countTimeout = countTimeout;
  }

  public async getSelectorShape(): Promise<FragmentSelectorShape> {
    return QuerySourceRaw.SELECTOR_SHAPE;
  }

  public async getFilterFactor(): Promise<number> {
    return 1;
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
        this.algebraFactory,
        this.bindMethod,
        operationIn,
        options.joinBindings,
      );
    } else {
      operationPromise = Promise.resolve(operationIn);
    }

    const bindings: BindingsStream = new TransformIterator(async() => {
      const operation = await operationPromise;
      const variables: RDF.Variable[] = algebraUtils.inScopeVariables(operation);
      const queryString = context.get<string>(KeysInitQuery.queryString);
      const queryFormat: RDF.QueryFormat = context.getSafe(KeysInitQuery.queryFormat);
      const selectQuery: string = !options?.joinBindings && queryString && queryFormat.language === 'sparql' ?
        queryString :
        await this.operationToSelectQuery(this.algebraFactory, operation, variables);
      const undefVariables = QuerySourceSparql.getOperationUndefs(operation);

      Actor.getContextLogger(context)?.info(`Asking for:\n${selectQuery}`);

      return this.queryBindingsRemote(operation, this.url, selectQuery, variables, context, undefVariables);
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
    let variablesCount: MetadataVariable[] = [];
    new Promise<[Algebra.Operation, string]>(async(resolve, reject) => {
      const operation = await operationPromise;
      const undefVariables = QuerySourceSparql.getOperationUndefs(operation);
      const variablesScoped = algebraUtils.inScopeVariables(operation);
      variablesCount = variablesScoped.map(variable => ({
        variable,
        canBeUndef: undefVariables.some(undefVariable => undefVariable.equals(variable)),
      }));
      // ugly, we reprocess the query that is sent.
      const selectQuery: string = await this.operationToSelectQuery(this.algebraFactory, operation, variablesScoped);
      return resolve([operation, selectQuery]);
    }).then(([operation, selectQuery]) => {
      const metadata =  {
        state: new MetadataValidationState(),
        cardinality: { type: 'estimate', value: Number.POSITIVE_INFINITY },
        variables: variablesCount,
        query: selectQuery,
      };
      
      target.setProperty('metadata', metadata);

      // hence logged twice, since it's called during metadata retrieval, and actual execution
      QuerySourceRaw.initializeLogger(context, operation, selectQuery);
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
    QuerySourceRaw.updateStartTime(context, operation);
    const undefVariablesIndex: Set<string> = new Set();
    for (const undefVariable of undefVariables) {
      undefVariablesIndex.add(undefVariable.value);
    }
    
    this.lastSourceContext = this.context.merge(context);
    const rawStream = await this.endpointFetcher.fetchBindings(endpoint, query);
    this.lastSourceContext = undefined;

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
            return [ variable, value ] as [RDF.Variable, RDF.Term];
          }).filter(([ _, v ]) => Boolean(v)))
      });

    return it;
  }

  public queryQuads(operation: Algebra.Operation, context: IActionContext): AsyncIterator<RDF.Quad> {
    throw new Error('queryQuads is not implemented in QuerySourceRaw.');
  }

  public queryBoolean(operation: Algebra.Ask, context: IActionContext): Promise<boolean> {
    throw new Error('queryBoolean is not implemented in QuerySourceRaw.');
  }

  public queryVoid(operation: Algebra.Operation, context: IActionContext): Promise<void> {
    throw new Error('queryVoid is not implemented in QuerySourceRaw.');
  }
  
  public toString(): string {
    return `QuerySourceRaw(${this.url})`;
  }

  /**
   * Convert an operation to a select query for this pattern.
   * @param algebraFactory The algebra factory.
   * @param {Algebra.Operation} operation A query operation.
   * @param {RDF.Variable[]} variables The variables in scope for the operation.
   * @return {string} A select query string.
   */
  public operationToSelectQuery(
    algebraFactory: AlgebraFactory,
    operation: Algebra.Operation,
    variables: RDF.Variable[],
  ): Promise<string> {
    if (operation.type === Algebra.Types.PROJECT || operation.type === Algebra.Types.SLICE) {
      return this.operationToQuery(operation);
    } else {
      return this.operationToQuery(algebraFactory.createProject(operation, variables));
    }
  }

  /**
   * Convert an operation to a query for this pattern.
   * @param {Algebra.Operation} operation A query operation.
   * @return {string} A query string.
   */
  public async operationToQuery(operation: Algebra.Operation): Promise<string> {
    return (await this.mediatorQuerySerialize.mediate({
      queryFormat: { language: 'sparql', version: '1.2' },
      operation,
      newlines: false,
      indentWidth: 0,
      context: this.context,
    })).query;
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
      variables: algebraUtils.inScopeVariables(operation).map(v => v.value),
      query: query,
    };

    physicalQueryPlanLogger.logOperation(
      Algebra.Types.SERVICE, /* logical operation */
      undefined, /* physical operation */
      operation, /* node */
      context.get(KeysInitQuery.physicalQueryPlanNode), /* parentNode */
      "raw", /* actor */
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
    if (!operation.metadata) { operation.metadata = {} }
    if (physicalQueryPlanLogger && operation.metadata) {
      operation.metadata['startAt'] = Date.now();
      physicalQueryPlanLogger.appendMetadata(operation, {startAt: operation.metadata['startAt']});
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
    if (!operation.metadata) { operation.metadata = {} }
    if (physicalQueryPlanLogger && operation.metadata) {
      operation.metadata['doneAt'] = Date.now();
      operation.metadata['timeLife'] = (operation.metadata['doneAt'] as number) - (operation.metadata['startAt'] as number);
      physicalQueryPlanLogger.appendMetadata(operation, {doneAt: operation.metadata['doneAt']});
      physicalQueryPlanLogger.appendMetadata(operation, {timeLife: operation.metadata['timeLife']})
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
    if (!operation.metadata) { operation.metadata = {} }
    if (physicalQueryPlanLogger && operation.metadata) {
      operation.metadata['cardinalityReal'] = nbResults;
      physicalQueryPlanLogger.appendMetadata(operation, {cardinalityReal: nbResults})
    }
  }

}
