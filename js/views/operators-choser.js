import Algebra from "sparqlalgebrajs";

const BOOLEAN = {
    TRUE: true,
    ALWAYS_TRUE: "always_true",
    FALSE: false,
    ALWAYS_FALSE: "always_false"
};

/// The end-user can choose the operators handled by comunica, and the one
/// sent to a passage endpoint.
export class OperatorsChoser {

    STORAGE_ENTRY = "operators";
    operators = new Map();
    container;
    
    constructor(container) {
        this.container = container;

        // localStorage.clear();
        if (localStorage && localStorage.getItem(this.STORAGE_ENTRY)) {
            this.operators = new Map(Object.entries(JSON.parse(localStorage.getItem(this.STORAGE_ENTRY))));
        } else {
            this.operators.set("project", {state: BOOLEAN.ALWAYS_TRUE, algebra: Algebra.types.PROJECT});
            this.operators.set("distinct", {state: BOOLEAN.ALWAYS_FALSE, algebra: Algebra.types.DISTINCT});
            this.operators.set("aggregate (count, min, max…)", {state: BOOLEAN.ALWAYS_FALSE});
            this.operators.set("triple/quad pattern", {state: BOOLEAN.ALWAYS_TRUE, algebra: Algebra.types.PATTERN});
            this.operators.set("basic graph pattern (BGP)", {state: BOOLEAN.TRUE, algebra: Algebra.types.BGP});
            
            this.operators.set("bind as", {state: BOOLEAN.ALWAYS_TRUE, algebra: Algebra.types.EXTEND});
            this.operators.set("values", {state: BOOLEAN.TRUE, algebra: Algebra.types.VALUES});
            this.operators.set("join", {state: BOOLEAN.TRUE, algebra: Algebra.types.JOIN});
            this.operators.set("optional", {state: BOOLEAN.TRUE, algebra: Algebra.types.LEFT_JOIN});
            this.operators.set("union", {state: BOOLEAN.TRUE, algebra: Algebra.types.UNION});
            this.operators.set("filter", {state: BOOLEAN.TRUE, algebra: Algebra.types.FILTER});
            this.operators.set("property path pattern", {state: BOOLEAN.ALWAYS_FALSE, algebra: Algebra.types.PATH});
            this.operators.set("group by", {state: BOOLEAN.ALWAYS_FALSE, algebra: Algebra.types.GROUP});
            this.operators.set("order by", {state: BOOLEAN.ALWAYS_FALSE, algebra: Algebra.types.ORDER_BY});
            this.operators.set("limit offset", {state: BOOLEAN.ALWAYS_TRUE, algebra: Algebra.types.SLICE});
            this.operators.set("service", {state: BOOLEAN.ALWAYS_FALSE, algebra: Algebra.types.SERVICE});
        };
        
        this.draw();
    }


    draw() {
        const config_row = document.createElement("div");
        config_row.classList.add("requestConfigWrapper");
        config_row.classList.add("textSetting");
        
        const operators_table = document.createElement("table");

        const thead = document.createElement("thead");
        const tr_head = document.createElement("tr");
        tr_head.title = `Checked operators are handled by the Passage server, the rest are
handle locally by Comunica. The more operators are pushed to Passage,
the more efficient the computation. Unfortunately, all operators are not available to Passage (yet).`;
        const td_head_name = document.createElement("th");
        td_head_name.innerHTML = "Endpoint Interface";
        const td_head_checkbox = document.createElement("th");
        tr_head.appendChild(td_head_name);
        tr_head.appendChild(td_head_checkbox);
        thead.appendChild(tr_head);
        operators_table.appendChild(thead);
        
        const tbody = document.createElement("tbody");

        const self = this;
        this.operators.forEach((v,k) => {
            const tr = document.createElement("tr");
            const td_name = document.createElement("td");
            td_name.innerHTML = k;
            let td_state = document.createElement("td");
            let td_checkbox = document.createElement("input");
            td_checkbox.setAttribute("type", "checkbox");
            td_checkbox.id = k;
            td_checkbox.name = k;
            td_checkbox.checked = v.state === BOOLEAN.TRUE || v.state === BOOLEAN.ALWAYS_TRUE
            td_state.appendChild(td_checkbox);
            td_checkbox.disabled = v.state === BOOLEAN.ALWAYS_TRUE || v.state === BOOLEAN.ALWAYS_FALSE;
            if (!td_checkbox.disabled) {
                td_checkbox.onclick = function(e) {
                    // `stopPropagation` is required as a parent prevents the input from applying properly.
                    // so without it, the checkbox do not check/uncheck.
                    e.stopPropagation();
                    v.state = !v.state; // toggle true or false
                    localStorage && localStorage.setItem(self.STORAGE_ENTRY, JSON.stringify(Object.fromEntries(self.operators)));
                   
                };
            }

            tr.appendChild(td_name);
            tr.appendChild(td_state);
            tbody.appendChild(tr);
        });

        operators_table.appendChild(tbody);

        config_row.appendChild(operators_table);
        this.container.appendChild(config_row);
        
    }


    /// Generate the JSON configuration for the Comunica's Shape
    toJson() {
        let configuration = new Object();
        configuration.type = "disjunction";
        configuration.children = [];
        this.operators.forEach((v, k) => {
            if (v.state === BOOLEAN.TRUE || v.state === BOOLEAN.ALWAYS_TRUE ) {
                configuration.children.push({
                    type: "operation",
                    operation: { operationType: "type", type: v.algebra },
                });
            };
        });
        return configuration;
    }

}
