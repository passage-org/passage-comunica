
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

        // console.log(node);
        // console.log(node.previous());
        // console.log(node.allPrevious());

        const allPrevious = node.allPrevious();
        const allNext = node.allNext();

        let allServices = [];
        // previous && allServices.push(previous);
        allServices = allServices.concat(allPrevious);
        allServices.push(node);
        allServices = allServices.concat(allNext);
        // next && allServices.push(next);

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
        const pre = document.createElement("pre");
        pre.textContent = service.metadata();
        card.append(pre);

        return card;
    }
    
}
