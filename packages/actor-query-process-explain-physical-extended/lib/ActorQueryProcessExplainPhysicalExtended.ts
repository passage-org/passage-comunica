import type {IActionQueryProcess, IActorQueryProcessArgs, IQueryProcessSequential,} from '@comunica/bus-query-process';
import {ActorQueryProcess,} from '@comunica/bus-query-process';
import {KeysInitQuery} from '@comunica/context-entries';
import {ActionContextKey, failTest, IActorTest, passTestVoid, TestResult} from '@comunica/core';
import {MemoryPhysicalQueryPlanLogger} from '@comunica/actor-query-process-explain-physical';
import {BindingsStream} from "@comunica/types";

/**
 * A comunica Explain Physical Query Process Actor.
 */
export class ActorQueryProcessExplainPhysicalExtended extends ActorQueryProcess {
  public readonly queryProcessor: IQueryProcessSequential;

  public constructor(args: IActorQueryProcessExplainPhysicalArgs) {
    super(args);
  }

  public async test(action: IActionQueryProcess): Promise<TestResult<IActorTest>> {
    const mode = (action.context.get(KeysInitQuery.explain) ?? action.context.get(new ActionContextKey('explain')));

    if (mode !== 'physical' && mode !== 'physical-json') {
      return failTest(`${this.name} can only explain in 'physical' or 'physical-json' mode.`);
    }

    return passTestVoid();
  }

  public async run(action: IActionQueryProcess): Promise<any> { // TODO go back to IActorQueryProcessOutput when it authorizes both explain and results
    // Run all query processing steps in sequence

    let { operation, context } = await this.queryProcessor.parse(action.query, action.context);
    ({ operation, context } = await this.queryProcessor.optimize(operation, context));

    // If we need a physical query plan, store a physical query plan logger in the context, and collect it after exec
    // TODO should return an IPhysicalPlanLogger stuff, but since it does not comprise toCompactString, we
    //      keep casting until changes
    //let physicalQueryPlanLogger: EmitterPhysicalQueryPlanLogger | undefined = context.get(KeysInitQuery.physicalQueryPlanLogger) as EmitterPhysicalQueryPlanLogger;
    let physicalQueryPlanLogger: MemoryPhysicalQueryPlanLogger | undefined = context.get(KeysInitQuery.physicalQueryPlanLogger) as MemoryPhysicalQueryPlanLogger;

    if (!physicalQueryPlanLogger) {
      // physicalQueryPlanLogger = new EmitterPhysicalQueryPlanLogger(new MemoryPhysicalQueryPlanLogger());
      physicalQueryPlanLogger = new MemoryPhysicalQueryPlanLogger();
      context = context.set(KeysInitQuery.physicalQueryPlanLogger, physicalQueryPlanLogger);
    } else {
      // only the root, i.e. the initializer is allowed to explain
      context = context.delete(KeysInitQuery.explain);
    }

    const output = await this.queryProcessor.evaluate(operation, context);
    // if we don't have to explain, we return the output directly
    if (!context.get(KeysInitQuery.explain)) { return { result: output };}

    // Make sure the whole result is produced
    let bindings : BindingsStream | undefined = undefined;
    switch (output.type) {
      case 'bindings':
        bindings = output.bindingsStream;
        break;
      case 'quads':
        await output.quadStream.toArray();
        break;
      case 'boolean':
        await output.execute();
        break;
      case 'void':
        await output.execute();
        break;
    }

    const mode: 'parsed' | 'logical' | 'physical' | 'physical-json' = action.context.get(KeysInitQuery.explain) ??
        action.context.getSafe(KeysInitQuery.explain);

    /*let resultDone = new Promise<String>((resolve, reject) =>
        bindings?.on("end",  () => {
          console.log("done");
          resolve(mode.includes('physical-json') ? physicalQueryPlanLogger.toJson() :
              mode.includes('physical') ? physicalQueryPlanLogger.toCompactString() : undefined);
        })
    );*/

    return {
      result: {
        bindingsStream: bindings,
        explain: true,
        type: mode,
        data: physicalQueryPlanLogger.toCompactString()
        // resultDone,
      },
    };
  }
}

export interface IActorQueryProcessExplainPhysicalArgs extends IActorQueryProcessArgs {
  queryProcessor: IQueryProcessSequential;
}
