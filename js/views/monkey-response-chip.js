
/// Patches the response chip of yasr that displays the number of results
/// along with the time to get them.
/// Now, multiple responses arrive over time, and the query is done when
/// there are no more outgoing queries.

export class MonkeyResponseChip {

    REFRESH_RATE = 100;
    
    constructor(yasr) {
        this.yasr = yasr;
    }
    
    // Start the automatic refresh every REFRESH_RATE
    start () {
        if (!this.refresh) {
            this.refresh = setInterval(() => {this.yasr.updateResponseInfo();}, this.REFRESH_RATE);
        }
    }
    
    // Stop the automatic refresh
    stop () {
        if (this.refresh) {
            this.yasr.updateResponseInfo();
            clearInterval(this.refresh);
            this.refresh = null;
        }
    }
    
};
