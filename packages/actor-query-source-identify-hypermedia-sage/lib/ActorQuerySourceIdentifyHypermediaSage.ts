import { BindingsFactory } from '@comunica/bindings-factory';
import type { MediatorHttp } from '@comunica/bus-http';
import type { MediatorMergeBindingsContext } from '@comunica/bus-merge-bindings-context';
import type {
  IActionQuerySourceIdentifyHypermedia,
  IActorQuerySourceIdentifyHypermediaOutput,
  IActorQuerySourceIdentifyHypermediaArgs,
  IActorQuerySourceIdentifyHypermediaTest,
} from '@comunica/bus-query-source-identify-hypermedia';
import {
  ActorQuerySourceIdentifyHypermedia,
} from '@comunica/bus-query-source-identify-hypermedia';

import type {
    BindMethod,
    IActorQuerySourceIdentifyHypermediaSparqlArgs
} from "@comunica/actor-query-source-identify-hypermedia-sparql";
import { QuerySourceSage } from "./QuerySourceSage";

// Sage is very much alike SPARQL but the endpoint is different
// Of course, this could be factorized with `ActorQuerySourceIdentifyHypermediaSparql`
// but for now, we don't want to touch official comunica's files.
export class ActorQuerySourceIdentifyHypermediaSage extends ActorQuerySourceIdentifyHypermedia {
    public readonly mediatorHttp: MediatorHttp;
    public readonly mediatorMergeBindingsContext: MediatorMergeBindingsContext;
    public readonly checkUrlSuffix: boolean;
    public readonly forceHttpGet: boolean;
    public readonly cacheSize: number;
    public readonly bindMethod: BindMethod;
    public readonly countTimeout: number;

    public constructor(args: IActorQuerySourceIdentifyHypermediaSparqlArgs) {
        super(args, 'sage');
    }

    public async testMetadata(
        action: IActionQuerySourceIdentifyHypermedia,
    ): Promise<IActorQuerySourceIdentifyHypermediaTest> {
        if (!action.forceSourceType && !action.metadata.sparqlService &&
            !(this.checkUrlSuffix && action.url.endsWith('/sage'))) {
            throw new Error(`Actor ${this.name} could not detect a SPARQL service description or URL ending on /sparql.`);
        }
        return { filterFactor: 1 };
    }

    public async run(action: IActionQuerySourceIdentifyHypermedia): Promise<IActorQuerySourceIdentifyHypermediaOutput> {
        this.logInfo(action.context, `Identified ${action.url} as sparql source with service URL: ${action.metadata.sparqlService || action.url}`);
        const source = new QuerySourceSage(
            action.forceSourceType ? action.url : action.metadata.sparqlService || action.url,
            action.context,
            this.mediatorHttp,
            this.bindMethod,
            await BindingsFactory.create(this.mediatorMergeBindingsContext, action.context),
            this.forceHttpGet,
            this.cacheSize,
            this.countTimeout,
        );
        return { source };
    }
}
