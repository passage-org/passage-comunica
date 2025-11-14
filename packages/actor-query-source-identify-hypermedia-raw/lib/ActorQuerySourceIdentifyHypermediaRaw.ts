import {BindingsFactory} from '@comunica/utils-bindings-factory';
import type {MediatorHttp} from '@comunica/bus-http';
import type {MediatorMergeBindingsContext} from '@comunica/bus-merge-bindings-context';
import type {
    IActionQuerySourceIdentifyHypermedia,
    IActorQuerySourceIdentifyHypermediaArgs,
    IActorQuerySourceIdentifyHypermediaOutput,
    IActorQuerySourceIdentifyHypermediaTest
} from '@comunica/bus-query-source-identify-hypermedia';
import {ActorQuerySourceIdentifyHypermedia} from '@comunica/bus-query-source-identify-hypermedia';
import type {BindMethod} from "@comunica/actor-query-source-identify-hypermedia-sparql";
import {QuerySourceRaw} from "./QuerySourceRaw";
import type {TestResult} from '@comunica/core';
import {failTest, passTest} from '@comunica/core';
import type {ComunicaDataFactory} from '@comunica/types';
import {Factory} from 'sparqlalgebrajs';
import {KeysInitQuery} from '@comunica/context-entries';

// Raw is very much alike SPARQL but the endpoint is different
// Of course, this could be factorized with `ActorQuerySourceIdentifyHypermediaSparql`
// but for now, we don't want to touch official comunica's files.
export class ActorQuerySourceIdentifyHypermediaRaw extends ActorQuerySourceIdentifyHypermedia {
    public readonly mediatorHttp: MediatorHttp;
    public readonly mediatorMergeBindingsContext: MediatorMergeBindingsContext;
    // public readonly mediatorQueryProcess: MediatorQueryProcess;
    public readonly checkUrlSuffix: boolean;
    public readonly forceHttpGet: boolean;
    public readonly cacheSize: number;
    public readonly bindMethod: BindMethod;
    public readonly countTimeout: number;

    public constructor(args: IActorQuerySourceIdentifyHypermediaRawArgs) {
        super(args, 'raw');
    }

    public async testMetadata(
        action: IActionQuerySourceIdentifyHypermedia,
    ): Promise<TestResult<IActorQuerySourceIdentifyHypermediaTest>> {
        if (!action.forceSourceType && !action.metadata.sparqlService &&
            !(this.checkUrlSuffix && ( // ends with a RAW-related suffix
                action.url.endsWith('/raw') ||
                action.url.endsWith('/cost') ||
                action.url.endsWith('/agg')
            ))) {
            return failTest(`Actor ${this.name} could not detect a RAW service description or URL ending on /raw.`);
        }
        return passTest({ filterFactor: 1 });
    }

    public async run(action: IActionQuerySourceIdentifyHypermedia): Promise<IActorQuerySourceIdentifyHypermediaOutput> {
        this.logInfo(action.context, `Identified ${action.url} as raw source with service URL: ${action.metadata.sparqlService || action.url}`);
        const dataFactory: ComunicaDataFactory = action.context.getSafe(KeysInitQuery.dataFactory);
        const algebraFactory = new Factory(dataFactory);
        const source = new QuerySourceRaw(
            action.forceSourceType ? action.url : action.metadata.sparqlService || action.url,
            action.context,
            this.mediatorHttp,
            this.bindMethod,
            dataFactory,
            algebraFactory,
            await BindingsFactory.create(this.mediatorMergeBindingsContext, action.context, dataFactory),
            this.forceHttpGet,
            this.cacheSize,
            this.countTimeout,
            // this.mediatorQueryProcess
        );
        return { source };
    }

}

// Tried multiple times to extend arguments from Sparql's actor, couldnot make it…
export interface IActorQuerySourceIdentifyHypermediaRawArgs extends IActorQuerySourceIdentifyHypermediaArgs {
    // /**
    //  * SPARQL queries returns by raw can be parsed again, then executed again.
    //  */
    // mediatorQueryProcess: MediatorQueryProcess;
    /**
     * The HTTP mediator
     */
    mediatorHttp: MediatorHttp;
    /**
     * A mediator for creating binding context merge handlers
     */
    mediatorMergeBindingsContext: MediatorMergeBindingsContext;
    /**
     * If URLs ending with '/sparql' should also be considered SPARQL endpoints.
     * @default {true}
     */
    checkUrlSuffix: boolean;
    /**
     * If non-update queries should be sent via HTTP GET instead of POST
     * @default {false}
     */
    forceHttpGet: boolean;
    /**
     * The cache size for COUNT queries.
     * @range {integer}
     * @default {1024}
     */
    cacheSize?: number;
    /**
     * The query operation for communicating bindings.
     * @default {values}
     */
    bindMethod: BindMethod;
    /**
     * Timeout in ms of how long count queries are allowed to take.
     * If the timeout is reached, an infinity cardinality is returned.
     * @default {3000}
     */
    countTimeout: number;


}
