import {Parser, Generator} from "sparqljs";
import {YasguiConfig} from "/js/yasgui-config"

/// A carousel to better visualize SPARQL continuation queries. Since
/// continuation queries most often form a line of continuations, the
/// carousel allows navigating through it conveniently.
export class ContinuationsCarousel {

    parent; // the parent container to add this view to.
    container; // the container created.
    
    /// node is a service that possibly is a continuation query.
    constructor(parent, node) {
        parent.innerHTML = "";
        this.container = document.createElement("ul");
        this.container.classList.add("carousel-container");

        const allPrevious = node.allPrevious();
        const allNext = node.allNext();

        let allServices = [];
        allPrevious && allServices.push(...allPrevious);
        allServices.push(node);
        allNext && allServices.push(...allNext);

        const id2dom = new Map();
        for (let service of allServices) {
            const card = this.createCard(service);
            this.container.append(card);
            id2dom.set(service.id, card);
        }
        
        parent.append(this.container);

        const target = id2dom.get(node.id);
        target.classList.add("carousel-targeted");
        
        requestAnimationFrame(() => { // < need this otherwise offsetLeft is 0
            // center the carousel on the targeted item

            const targetOffset = target.offsetLeft;
            const targetWidth = target.offsetWidth;
            const containerWidth = this.container.offsetWidth;
            const offset = targetOffset - (containerWidth / 2) + (targetWidth / 2);
            this.container.scrollLeft = offset;
            this.container.focus(); // important that focus is in requestAnimationFrame too
        });


    }

    /// Create the styled card containing all information about the service
    /// node. For instance, the containuation query itself, its execution
    /// time, etc.
    createCard(service) {
        const card = document.createElement("li");
        card.classList.add("carousel-element");

        const container = document.createElement("div");
        container.classList.add("card-container");
        
        const query = document.createElement("pre");
        query.classList.add("card-query");

        const parser = new Parser({prefixes: YasguiConfig.yasr.prefixes});
        const parsed = parser.parse(service.query());
        const generator = new Generator();
        const generated = generator.stringify(parsed);
        query.textContent = generated;
        // query.textContent = service.query();

        const metadata = document.createElement("div");
        metadata.classList.add("card-metadata");
        
        const stats = document.createElement("pre");
        stats.classList.add("card-stats");
        stats.textContent = service.stats();
        
        const error = document.createElement("pre");
        error.classList.add("card-error");
        error.textContent = service.error(); 
            
        const date = document.createElement("div");
        date.classList.add("card-date");
        date.innerHTML = "[" + service.formatedDate() + "]";
        
        container.append(query);
        
        metadata.append(stats);
        metadata.append(error);
        metadata.append(date);

        container.append(metadata);
        
        card.append(container);

        return card;
    }
    
}
