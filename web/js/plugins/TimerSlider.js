
export class TimeSlider {
  constructor(onChangeCallback) {
    this.slider = null;
    this.label = null;
    this.container = null;
    this.onChangeCallback = onChangeCallback;
  }

  mount(parentElement) {
    this.container = document.createElement("div");
    this.container.style.margin = "1rem 0";

    this.slider = document.createElement("input");
    this.slider.type = "range";
    this.slider.min = "0";
    this.slider.max = "100";
    this.slider.value = "0";
    this.slider.id = "time-slider";
    this.slider.style.width = "100%";

    
    this.container.appendChild(this.slider);
    parentElement.appendChild(this.container);

    this.slider.addEventListener("input", () => {
      const percent = parseInt(this.slider.value, 10);
      if (this.onChangeCallback) {
        this.onChangeCallback(percent);
      }
      
    });
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

  destroy() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
