export const display_suggestions = {
    // AUTOCOMPLETION DISPLAY 

    getOrCreateLoaderIcon: function(){
        const loader = document.getElementsByClassName("loader-icon").item(0) ?? document.createElement("div");
        loader.classList.add("loader-icon");

        return loader;
    },

    getOrCreateErrorIcon: function(){
        const error = document.getElementsByClassName("error-icon").item(0) ?? document.createElement("div");
        error.classList.add("error-icon");

        return error;
    },

    clearIcons: function(){
        const loader = document.getElementsByClassName("loader-icon").item(0);
        if(loader) loader.remove();

        const error = document.getElementsByClassName("error-icon").item(0);
        if(error) error.remove();
    },

    autocompleteStartFeedback: function(){
        this.clearIcons();

        console.log("Starting autocompletion ...");

        const yasguiElement = document.getElementsByClassName("yasgui").item(0);
        const cursor = document.getElementsByClassName("CodeMirror-cursor").item(0);

        const loader = this.getOrCreateLoaderIcon();

        const dim = cursor.getBoundingClientRect();
        
        loader.style.left = (dim.x + dim.width) + "px";
        loader.style.top = (dim.top + window.scrollY) + "px";

        yasguiElement.appendChild(loader);
    },

    autocompleteEndFeedback: function(hints){
        this.clearIcons();

        console.log("End of autocompletion!");

        if(hints.length === 0) {
            console.log("Autcompletion query didn't return any results.");

            const cursor = document.getElementsByClassName("CodeMirror-cursor").item(0);
            const yasguiElement = document.getElementsByClassName("yasgui").item(0);
            const error = this.getOrCreateErrorIcon();

            const dim = cursor.getBoundingClientRect();
    
            error.style.left = (dim.x + dim.width) + "px";
            error.style.top = (dim.top + window.scrollY) + "px";

            error.innerHTML = "&#10005;";

            yasguiElement.appendChild(error);
        }

        else if(hints.filter(hint => (hint.probabilityOfRetrievingRestOfMapping && hint.probabilityOfRetrievingRestOfMapping.value) !== 0).length === 0)
            console.log("Autocompletion query returned results, but none of them have probability != 0")

        else
            console.log("Successfuly retrieved suggestions!")
        
    },


    getRenderHint: function(_yasqe, _colorHash, removeProvenanceDisplay) {
        const line = _yasqe.getDoc().getCursor().line;
        const ch = _yasqe.getDoc().getCursor().ch;

        return function(el, self, data){

            // Adjusting where to insert the completed entity, in order to prevent eating characters right before or after. WIP
            const current = _yasqe.getTokenAt({line: line, ch: ch});
            data.from = {line: line, ch: current.string === "." || current.string === "{" ? ch : self.from.ch};
            data.to = {line: line, ch: Math.min(self.to.ch, ch)};
    
            const suggestionObject = data.displayText;
            const value = suggestionObject.value;
            const score = suggestionObject.score;
            const walks = suggestionObject.walks;
            const finalProvenances = suggestionObject.suggestionVariableProvenances
                    .map(source => source.split("http://").at(2)) // wanky but for now is ok
                    .filter(o => o !== undefined) // when there are no source , filter out
                    .map(source => {return {source: source, hsl: _colorHash.hsl(source), hex: _colorHash.hex(source)}})
                    .sort((a, b) => a.hsl[0] - b.hsl[0]);
    
            // We store an object in the displayTextField. Definitely not as intented, but works (...?)


            // MAIN INFO / LIST ELEMENT

            // main div (label - id - description (wip) - provenance squares)
            const suggestionDiv = document.createElement("div");
            suggestionDiv.className = "suggestion-div";
    
            // suggestion content (label - id - description (wip))
            const suggestionValue = document.createElement("div");
            suggestionValue.className = "suggestion-value";
            suggestionValue.cssFloat = "";

            // suggestion label (label - id)
            const suggestionPrimary = document.createElement("div");

            // label 
            const labelSpan = document.createElement("span");
            labelSpan.className = "suggestion-label";
            labelSpan.textContent = suggestionObject.label;

            // id
            const idSpan = document.createElement("span");
            idSpan.className = suggestionObject.label ? "suggestion-id with-label" : "suggestion-id";
            idSpan.textContent = suggestionObject.value;

            if(suggestionObject.label) suggestionPrimary.appendChild(labelSpan); // no label span if there is no label
            suggestionPrimary.appendChild(idSpan);

            // description (wip)
            const suggestionDescription = document.createElement("div");

            const descriptionSpan = document.createElement("span");
            descriptionSpan.className = "suggestion-description";
            // descriptionSpan.textContent = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nam fermentum purus dapibus lacus fringilla, at aliquam libero luctus. Fusce laoreet mattis molestie. Vestibulum non magna eget nisl varius pellentesque. Cras eleifend dui vel sem gravida iaculis non fringilla orci. Proin venenatis risus neque, eu accumsan diam volutpat id. Duis a nibh hendrerit, elementum lorem non, elementum dolor. Quisque feugiat fringilla nunc ut rhoncus. Aliquam accumsan accumsan justo. ";
            descriptionSpan.textContent = "";

            suggestionDescription.appendChild(descriptionSpan);

            suggestionValue.appendChild(suggestionPrimary);
            suggestionValue.appendChild(suggestionDescription);
            

            // provenance squares
            const sourceMarkerSection = document.createElement("section");
            sourceMarkerSection.className = "source-marker-section";
            for(const prov of finalProvenances){
                const sourceMarker = document.createElement("div");
                sourceMarker.className = "source-marker";
                sourceMarker.style.backgroundColor = prov.hex;
                sourceMarkerSection.appendChild(sourceMarker);
                sourceMarker.title = prov.source;
            }


            // ADDITIONAL INFO

            // detail div (score - number of walks - number of sources - provenance)
            const suggestionDetail = document.createElement("div");
            suggestionDetail.className = "suggestion-detail CodeMirror-hints";
    
            // score
            const suggestionScore = document.createElement("span");
            suggestionScore.className = "suggestion-score";
            suggestionScore.textContent = "Estimated cardinality : " + (score || "");
            suggestionScore.style.cssFloat = "";
    
            // number of walks
            const suggestionWalks = document.createElement("span");
            suggestionWalks.className = "suggestion-walks";
            suggestionWalks.textContent = "Random walks : " + (walks || "");
            suggestionWalks.style.cssFloat = "";
    
            // number of sources
            const suggestionProvenance = document.createElement("span");
            suggestionProvenance.className = "suggestion-provenance";
            suggestionProvenance.textContent = finalProvenances && finalProvenances.length !== 0 ? "Sources : " + (finalProvenances.length ?? "") : "";
            suggestionProvenance.style.cssFloat = "";
    
            // source list / provenance
            const suggestionProvenanceDetail = document.createElement("ul");
            suggestionProvenanceDetail.className = "suggestion-provenance-detail";
            finalProvenances.forEach(p => {
                const li = document.createElement("li");
                li.innerHTML = p.source;
                suggestionProvenanceDetail.appendChild(li);
            });
    
            suggestionDetail.appendChild(suggestionScore);
            suggestionDetail.appendChild(suggestionWalks);
            suggestionDetail.appendChild(suggestionProvenance);
            suggestionDetail.appendChild(suggestionProvenanceDetail);
    
            suggestionDiv.appendChild(suggestionValue);
            suggestionDiv.appendChild(sourceMarkerSection);
            
            el.appendChild(suggestionDiv);

            const displayProvenanceDetail = function(e){
                removeProvenanceDisplay(e);
    
                const yasguiElement = document.getElementsByClassName("yasgui").item(0);
    
                const dim = el.getBoundingClientRect();
    
                suggestionDetail.style.left = (dim.x + dim.width) + "px";
                suggestionDetail.style.top = (dim.top + window.scrollY) + "px";
    
                suggestionDetail.style.width = dim.width;
                suggestionDetail.style.height = dim.bottom - dim.top;
    
                yasguiElement.appendChild(suggestionDetail);
            }
    
            suggestionDiv.onmouseover = displayProvenanceDetail;
    
            data.text = value;
        }
    },

    
}