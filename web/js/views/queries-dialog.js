
/// A general class that displays and hide a dialog based on clicks
export class QueriesDialog {

    constructor(button, dialog, queries, yasqe) {
        const container = document.createElement("span");
        container.setAttribute("class", "examples_dialog_content");
        
        const table = document.createElement("table");
        const tbody = document.createElement("tbody");
        
        queries.forEach(q => {
            if (q.query === "") { return; }
            
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            const button = document.createElement("button");
            button.setAttribute("class", "examples_dialog_button")
            button.innerHTML = q.description;
            button.addEventListener("click", () => {
                yasqe.setValue(q.query);
            });
            button.setAttribute("title", q.name + ":\n\n" + q.query);
            
            td.appendChild(button);
            tr.appendChild(td);
            tbody.appendChild(tr);
        });
        
        table.appendChild(tbody);
        container.appendChild(table);
        dialog.appendChild(container);

        button.addEventListener("click", () => {
            dialog.showModal();
        });
        
        dialog.addEventListener('click', (event) => {
            // does not matter if the click is in or out,
            // we close the dialog anyway.
            dialog.close();
        });
    }
    
};
