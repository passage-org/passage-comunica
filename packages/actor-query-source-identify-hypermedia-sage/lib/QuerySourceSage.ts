
import { QuerySourceSage } from "@comunica/actor-query-source-identify-hypermedia-sparql";

export class QuerySourceSage extends QuerySourceSparql {

  public constructor(url: string, context: IActionContext, mediatorHttp: MediatorHttp,
                     bindMethod: BindMethod, bindingsFactory: BindingsFactory,
                     forceHttpGet: boolean, cacheSize: number, countTimeout: number) {
      super(url, context, mediatorHttp, bindMethod, bindingsFactory,
            forceHttpGet, cacheSize, countTimeout)
      console.log("meow");
  }
    
}
