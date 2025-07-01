
/// A slider that represents the timeline of the query execution.
/// It allows replaying the physical plan construction to better
/// understand the behavior of the underlying SPARQL query engine
/// Passage x Comunica.
export class TimeSlider {

    parent; // the parent DOM element
    container; // the slider container
    slider; // the slider itself

    minTime =  Infinity;
    maxTime = -Infinity;
        
    constructor(parent) {
        this.parent = parent;
        this.reset();
        // TODO fix this
        this.onChangeCallback = (percent) => {
            const minTime = timeLine[0].timestamp;
            const maxTime = timeLine[timeLine.length - 1].timestamp;
            const elapsed = performance.now() - start;
            const currentTime = Math.min(
                minTime + ((maxTime - minTime) * percent) / 100,
                minTime + elapsed
            );
            this.replayStateAt(currentTime);
        };
        this.mount();
    }

    update(entry) {
        this.minTime = entry && entry.date && Math.min(this.minTime, entry.date);
        this.maxTime = entry && entry.date && Math.max(this.maxTime, entry.date);
        // TODO update view
    }

    reset() {
        this.minTime =  Infinity;
        this.maxTime = -Infinity;
        
        this.container && this.container.remove(); // remove DOM
        this.mount();
    }
    
    mount() {
        this.container = document.createElement("div");
        this.container.style.margin = "1rem 0";

        // TODO remove id if unused + style in stylesheet
        this.slider = document.createElement("input");
        this.slider.type = "range";
        this.slider.min = "0";
        this.slider.max = "100";
        this.slider.value = "0";
        this.slider.style.width = "100%";
        
        this.slider.addEventListener("input", () => {
            const percent = parseInt(this.slider.value, 10);
            if (this.onChangeCallback) {
                this.onChangeCallback(percent);
            }
            
        });

        this.container.appendChild(this.slider);
        this.parent.appendChild(this.container);
    }

    setValue(percent) {
        if (this.slider) this.slider.value = percent;
    }

    getValue() {
        return this.slider ? parseInt(this.slider.value, 10) : 0;
    }

    setDisabled(disabled) {
        if (this.slider) this.slider.disabled = disabled;
    }

    //   updateLabel(timestamp) {
    //     if (this.label) {
    //       this.label.textContent = new Date(timestamp).toLocaleTimeString();
    //     }
    //   }
    
}
