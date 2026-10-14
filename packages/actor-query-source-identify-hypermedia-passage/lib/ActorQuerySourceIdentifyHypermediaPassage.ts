import type { MediatorHttp } from '@comunica/bus-http';
import type { MediatorMergeBindingsContext } from '@comunica/bus-merge-bindings-context';
import type { MediatorQuerySerialize } from '@comunica/bus-query-serialize';
import type {
    IActionQuerySourceIdentifyHypermedia,
    IActorQuerySourceIdentifyHypermediaOutput,
    IActorQuerySourceIdentifyHypermediaTest,
    IActorQuerySourceIdentifyHypermediaArgs
} from '@comunica/bus-query-source-identify-hypermedia';
import { ActorQuerySourceIdentifyHypermedia } from '@comunica/bus-query-source-identify-hypermedia';
import type { BindMethod } from "@comunica/actor-query-source-identify-hypermedia-sparql";
import type { MediatorQueryProcess } from "@comunica/bus-query-process";
import { failTest, passTest } from '@comunica/core';
import type { TestResult } from '@comunica/core';
import type { ComunicaDataFactory } from '@comunica/types';
import { AlgebraFactory } from '@comunica/utils-algebra';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import { QuerySourcePassage } from "./QuerySourcePassage";

import { KeysInitQuery } from '@comunica/context-entries';

// Passage is very much alike SPARQL but the endpoint is different
// Of course, this could be factorized with `ActorQuerySourceIdentifyHypermediaSparql`
// but for now, we don't want to touch official comunica's files.
export class ActorQuerySourceIdentifyHypermediaPassage extends ActorQuerySourceIdentifyHypermedia {
    public readonly mediatorHttp: MediatorHttp;
    public readonly mediatorMergeBindingsContext: MediatorMergeBindingsContext;
    public readonly mediatorQuerySerialize: MediatorQuerySerialize;
    public readonly mediatorQueryProcess: MediatorQueryProcess; // Added for Passage loop
    public readonly checkUrlSuffix: boolean;
    public readonly forceHttpGet: boolean;
    public readonly cacheSize: number;
    public readonly forceSourceType: boolean;
    public readonly bindMethod: BindMethod;
    public readonly countTimeout: number;
    public readonly sparqlServerSoftwarePatterns: RegExp[];


    public constructor(args: IActorQuerySourceIdentifyHypermediaPassageArgs) {
      super(args, 'passage');
      this.mediatorHttp = args.mediatorHttp;
      this.mediatorMergeBindingsContext = args.mediatorMergeBindingsContext;
      this.mediatorQuerySerialize = args.mediatorQuerySerialize;
      this.checkUrlSuffix = args.checkUrlSuffix;
      this.forceHttpGet = args.forceHttpGet;
      this.cacheSize = args.cacheSize;
      this.forceSourceType = Boolean(args.forceSourceType);
      this.bindMethod = args.bindMethod;
      this.countTimeout = args.countTimeout;
      this.sparqlServerSoftwarePatterns = (
        args.sparqlServerSoftwarePatterns ?? []
      ).map(pattern => new RegExp(pattern, 'u'));
    }

    public async testMetadata(
        action: IActionQuerySourceIdentifyHypermedia,
    ): Promise<TestResult<IActorQuerySourceIdentifyHypermediaTest>> {
        if (!action.forceSourceType && !action.metadata.sparqlService &&
            !(this.checkUrlSuffix && (action.url.endsWith('/passage') || action.url.endsWith('/passage/')))) {
            return failTest(`Actor ${this.name} could not detect a passage service description or URL ending on /passage or /passage/.`);
        }
        return passTest({ filterFactor: 1 });
    }

    public async run(action: IActionQuerySourceIdentifyHypermedia): Promise<IActorQuerySourceIdentifyHypermediaOutput> {
        this.logInfo(action.context, `Identified ${action.url} as passage source with service URL: ${action.metadata.sparqlService || action.url}`);
        const dataFactory: ComunicaDataFactory = action.context.getSafe(KeysInitQuery.dataFactory);
        const algebraFactory = new AlgebraFactory(dataFactory);
        const bindingsFactory = await BindingsFactory.create(this.mediatorMergeBindingsContext, action.context, dataFactory);
        const source = new QuerySourcePassage(
            action.forceSourceType ? action.url : action.metadata.sparqlService || action.url,
            action.context,
            this.mediatorHttp,
            this.mediatorQuerySerialize,
            this.bindMethod,
            dataFactory,
            algebraFactory,
            bindingsFactory,
            this.forceHttpGet,
            this.cacheSize,
            this.countTimeout,
            this.mediatorQueryProcess,
            action.metadata
        );
        return { source };
    }

}

// Tried multiple times to extend arguments from Sparql's actor, could not make it…
export interface IActorQuerySourceIdentifyHypermediaPassageArgs extends IActorQuerySourceIdentifyHypermediaArgs {
    /**
     * SPARQL queries returns by passage can be parsed again, then executed again.
     */
    mediatorQueryProcess: MediatorQueryProcess;

    /**
     * The HTTP mediator
     */
    mediatorHttp: MediatorHttp;
    /**
     * A mediator for creating binding context merge handlers
     */
    mediatorMergeBindingsContext: MediatorMergeBindingsContext;
    /**
     * Mediator for serializing queries.
     */
    mediatorQuerySerialize: MediatorQuerySerialize;
    /**
     * If URLs ending with '/passage' should also be considered Passage endpoints.
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
    cacheSize: number;

    /**
     * If provided, forces the source type of a source.
     * @default {false}
     */
    forceSourceType?: boolean;

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
    /**
     * Regexes to match against the server header to identify SPARQL endpoints.
     */
    sparqlServerSoftwarePatterns?: string[]; 

}

