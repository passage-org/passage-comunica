
/// Registers all plugins then routes towards the proper plugin.
/// Its not generic for now, and not meant to be: plugins have no
/// common interface yet to handle a message.
export class MessageRouter {
    
    constructor(engineView, logView, planView) {
        this.engineView = engineView;
        this.logView = logView;
        this.planView = planView;
    }

    routeMessageFromWorker (message) {
        switch (message.type) {
        case "MessageException": return this.engineView.forceErrorButton(message.exception);
        case "MessageDone": return this.engineView.forceDoneButton();
        case "MessageBindings":
            this.engineView.yasr.results.appendResponse(message);
            this.engineView.yasr.results.whenMoreCalm(()=>{this.engineView.yasr.plugins['table'].draw();});
            return;
        case "MessageComunicaLog": return this.logView.append(message);
        case "MessagePhysicalPlanInit": // fall through
        case "MessagePhysicalPlanAppend": return this.planView.append(message);
        default: throw new Exception(`Unknown message type ${JSON.stringify(message)}`);
        }
    }
    
}
