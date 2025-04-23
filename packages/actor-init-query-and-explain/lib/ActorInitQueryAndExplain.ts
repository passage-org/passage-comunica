/* eslint-disable import/no-nodejs-modules */
import {readFileSync} from 'node:fs';
import type {IActionInit, IActorOutputInit} from '@comunica/bus-init';
import {KeysInitQuery} from '@comunica/context-entries';
import type {ICliArgsHandler, IQueryContextCommon} from '@comunica/types';
import {Readable} from 'readable-stream';
import yargs from 'yargs';
import {
  ActorInitQueryBase,
  CliArgsHandlerBase,
  CliArgsHandlerQuery,
  IActorInitQueryBaseArgs
} from '@comunica/actor-init-query';
import {QueryEngineBaseExtended} from "./QueryEngineBaseExtended";

/**
 * A comunica Query Init Actor.
 */
export class ActorInitQueryAndExplain<QueryContext extends IQueryContextCommon = IQueryContextCommon> extends ActorInitQueryBase {
  public constructor(args: IActorInitQueryBaseArgs) {
    super(args);
  }

  public override async run(action: IActionInit): Promise<IActorOutputInit> {
    // Wrap this actor in a query engine so we can conveniently execute queries
    const queryEngine = new QueryEngineBaseExtended(this);

    const cliArgsHandlers: ICliArgsHandler[] = [
      new CliArgsHandlerBase(action.context),
      new CliArgsHandlerQuery(
        this.defaultQueryInputFormat,
        this.queryString,
        this.context,
        this.allowNoSources,
      ),
      ...(<ICliArgsHandler[]> action.context?.get(KeysInitQuery.cliArgsHandlers)) || [],
    ];

    // Populate yargs arguments object
    let argumentsBuilder = yargs([]);
    for (const cliArgsHandler of cliArgsHandlers) {
      argumentsBuilder = cliArgsHandler.populateYargs(argumentsBuilder);
    }

    // Extract raw argument values from parsed yargs object, so that we can handle each of them hereafter
    let args: Record<string, any>;
    try {
      args = await argumentsBuilder.parse(action.argv);
    } catch (error: unknown) {
      return {
        stderr: Readable.from([ `${await argumentsBuilder.getHelp()}\n\n${(<Error> error).message}\n` ]),
      };
    }

    // Print supported MIME types
    if (args.listformats) {
      const mediaTypes: Record<string, number> = await queryEngine.getResultMediaTypes();
      return { stdout: Readable.from([ `${Object.keys(mediaTypes).join('\n')}\n` ]) };
    }

    // Define query
    // We need to do this before the cliArgsHandlers, as we may modify the sources array
    let query: string | undefined;
    if (args.query) {
      query = <string> args.query;
    } else if (args.file) {
      query = readFileSync(args.file, { encoding: 'utf8' });
    } else if (args.sources.length > 0) {
      query = args.sources.at(-1);
      args.sources.pop();
    }

    // Invoke args handlers to process any remaining args
    const context: Record<string, any> = {};
    try {
      for (const cliArgsHandler of cliArgsHandlers) {
        await cliArgsHandler.handleArgs(args, context);
      }
    } catch (error: unknown) {
      return { stderr: Readable.from([ (<Error> error).message ]) };
    }

    // Evaluate query
    // TODO remove `any` to include it as possible output
    const queryResult: any = await queryEngine.queryAndExplain(query!, <any> context);



    // Serialize output according to media type
    // queryResult.resultType = 'bindings'; // TODO change this
    const stdout: Readable = <Readable> (await queryEngine.resultToString(
      queryResult,
      args.outputType,
      queryResult.context,
    )).data;

    // Output query explanations in a different way
    let explain: Readable = Readable.from([]);
    if ('explain' in queryResult) {
      const data: string = await queryResult.data;
      explain = Readable.from([ typeof data === 'string' ?
          // eslint-disable-next-line prefer-template
          data + '\n' :
          // eslint-disable-next-line prefer-template
          JSON.stringify(data, (key: string, value: any) => {
            if (key === 'scopedSource') {
              return value.source.toString();
            }
            return value;
          }, '  ') + '\n' ]);
    }

    async function* concatStreams(readables: any) {
      for (const readable of readables) {
        for await (const chunk of readable) { yield chunk }
      }
    }

    let iterable = await concatStreams([stdout, explain])
    const both: Readable = Readable.from(iterable);// Readable.from([stdout, explain]);
    return { stdout: both };
  }
}
/* eslint-enable import/no-nodejs-modules */
