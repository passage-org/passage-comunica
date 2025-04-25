import type {IQueryProcessSequentialOutput,} from '@comunica/bus-query-process';
import {ActionContextKey} from '@comunica/core';
import type {ComunicaDataFactory, IActionContext, IPhysicalQueryPlanLogger, QueryFormatType,} from '@comunica/types';
import {ActorQueryProcessSequential, IActorQueryProcessSequentialArgs} from '@comunica/actor-query-process-sequential';
import {Algebra, Factory} from "sparqlalgebrajs";
import {KeysInitQuery} from "@comunica/context-entries";
import {BindingsFactory} from "@comunica/utils-bindings-factory";
import {materializeOperation} from '@comunica/utils-query-operation';
import type * as RDF from '@rdfjs/types';

/**
 * A Sequential Query Process Actor that allows Recursive call even when the
 * physical/logical logger is defined.
 */
export class ActorQueryProcessSequentialRecursive extends ActorQueryProcessSequential {

  public constructor(args: IActorQueryProcessSequentialArgs) {
    super(args);
  }

  public override async parse(query: QueryFormatType, context: IActionContext): Promise<IQueryProcessSequentialOutput> {
    // Pre-processing the context
    // TODO initialized should be in the global dictionary of context keys
    //      Among others, the sources are skolemized multiple times without it.
    if (!context.get(new ActionContextKey("initialized"))) {
      if (context.get(new ActionContextKey("physicalQueryPlanLogger"))) {
        const factory: () => IPhysicalQueryPlanLogger = context.getSafe(new ActionContextKey("physicalQueryPlanLogger"));
        context = context.set(KeysInitQuery.physicalQueryPlanLogger, factory());
      }
      context = context.set(new ActionContextKey("initialized"), true);
      context = (await this.mediatorContextPreprocess.mediate({context, initialize: true})).context;
    }

    // The rest is similar to parent's …

    // Parse query
    let operation: Algebra.Operation;
    if (typeof query === 'string') {
      // Save the original query string in the context
      context = context.set(KeysInitQuery.queryString, query);

      const baseIRI: string | undefined = context.get(KeysInitQuery.baseIRI);
      const queryFormat: RDF.QueryFormat = context.get(KeysInitQuery.queryFormat)!;
      const queryParseOutput = await this.mediatorQueryParse.mediate({ context, query, queryFormat, baseIRI });
      operation = queryParseOutput.operation;
      // Update the baseIRI in the context if the query modified it.
      if (queryParseOutput.baseIRI) {
        context = context.set(KeysInitQuery.baseIRI, queryParseOutput.baseIRI);
      }
    } else {
      operation = query;
    }

    // Apply initial bindings in context
    if (context.has(KeysInitQuery.initialBindings)) {
      const dataFactory: ComunicaDataFactory = context.getSafe(KeysInitQuery.dataFactory);
      const algebraFactory = new Factory(dataFactory);
      const bindingsFactory = await BindingsFactory
          .create(this.mediatorMergeBindingsContext, context, dataFactory);
      operation = materializeOperation(
          operation,
          context.get(KeysInitQuery.initialBindings)!,
          algebraFactory,
          bindingsFactory,
          { strictTargetVariables: true },
      );

      // Delete the query string from the context, since our initial query might have changed
      context = context.delete(KeysInitQuery.queryString);
    }

    return { operation, context };
  }
}