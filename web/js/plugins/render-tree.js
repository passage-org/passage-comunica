
// import { buildTree } from "./build-tree.js";
import { Tree } from "./build-tree.js";

let scheduledEvents = [];
 export let start = null;
 export const pendingNodes = new Map();

const tree =new Tree()

function collectRenderEvents(node, parentElement, baseTime) {
  scheduledEvents.push({
    type: "node",
    timestamp: node.timestamp,
    node,
    parentElement,
  });

  node.events.forEach((evt) => {
    scheduledEvents.push({
      type: "event",
      timestamp: evt.timestamp,
      node,
      event: evt,
    });

  });

  if (!isProjectWithOnlyServices(node)) {
     node.children.forEach((child) => {
    collectRenderEvents(child, parentElement, baseTime);
  });
  //  return;
  }
 

   
}


function isProjectWithOnlyServices(node) {
   if (!node || !node.children || !Array.isArray(node.children)) return false;
  if (node.lo !== "project" && node.lo !=="slice") return false;
  return node.children.every(child => {
    if (child.lo === "service") return true;
    
    if(["project","slice"].includes(child.lo) && child.children && child.children.length > 0){
      return isProjectWithOnlyServices(child);}
   
    return false;
  });
}

function isSubtreeOnlyServices(node) {
  // Si c'est un service, on accepte
  if (node.lo === "service") return true;

  // Si c'est un slice ou project ou autre avec des enfants
  if (node.children && node.children.length > 0) {

    return node.children.every(child => isSubtreeOnlyServices(child));
  }

  // Si c'est un nœud non-service sans enfants => rejeté
  return false;
}


function renderServiceSquares(node, parentElement) {
  const li = document.createElement("li");
  li.style.listStyleType = "none";
  li.style.paddingLeft = "40px";
  li.classList.add("node");

  const contentSpan = document.createElement("span");
  contentSpan.className = "node-label";
  contentSpan.innerHTML = `<span class="timestamp">[${new Date(
    node.timestamp
  ).toLocaleTimeString()}]</span>  project (service group)`;

  const grid = document.createElement("div");
  grid.className = "service-grid";

  const flatServices = [];

  function collectServices(n) {
    n.children.forEach(child => {
      if (child.lo === "service") {
        flatServices.push(child);
      } else if (child.lo === "slice"  || child.lo === "project") {
        collectServices(child);

      }
    });
  }

  collectServices(node);

  li.appendChild(contentSpan);
  li.appendChild(grid);
  parentElement.appendChild(li);

  const baseTime = timeLine[0].timestamp;

  flatServices.forEach(service => {
    const delay = service.timestamp - baseTime;

    const square = document.createElement("div");
    square.className = "service-square";
    
    square.title = `
     
     Timestamp: ${new Date(service.timestamp).toLocaleTimeString()}\n
     TimeLife: ${service?.m?.timeLife ?? "N/A"}\n
     Cardinality: ${service?.m?.cardinalityReal ?? "N/A"}\n
     Query: ${service?.m?.query ?? "N/A"}`;


    grid.appendChild(square);
    if (service?.m?.status === "error") {
      square.style.backgroundColor = "red";
      square.title = ` ${service?.m?.message}`;
    }else{

      square.style.backgroundColor = " #a3be8c";
    }

    // Force transition sur l'opacité
    requestAnimationFrame(() => {
      square.style.opacity = "1";
    });
    setTimeout(() => {
    }, delay);
  });
}

function renderNodeProgressively(node, parentElement) {

 if (isProjectWithOnlyServices(node)) {
    renderServiceSquares(node, parentElement);
    return;
  }

  const li = document.createElement("li");
  li.style.listStyleType = "none";
  li.classList.add("node");
  li.setAttribute("data-node-id", node.n);

  const contentSpan = document.createElement("span");
  contentSpan.className = "node-label";
  contentSpan.innerHTML = `<span class="timestamp">[${new Date(
    node.timestamp
  ).toLocaleTimeString()}]</span>  ${node.lo}`;

  

  const eventSpan = document.createElement("span");
  eventSpan.className = "event-inline";
  eventSpan.style.marginLeft = "10px";

  li.appendChild(contentSpan);
  li.appendChild(eventSpan);




  const ul = document.createElement("ul");
  li.appendChild(ul);

  node._ul = ul;
  node._li = li;

  const effectiveParent = node.parent?._ul || parentElement;
  if (effectiveParent) {
    effectiveParent.appendChild(li);
  } else {
    console.error("Aucun parentElement trouvé pour le nœud", node);
  }

}


function applyEventToNode(node, evt) {
  
  if (!node._li) {
    console.error("No _li found for node", node);
    return;
  }
  const li = node._li;
  const eventSpan = li.querySelector(".event-inline");
  const m = evt.m;

  const displayParts = [];
  if ("timeLife" in m) displayParts.push(`time: ${m.timeLife}`);
  if ("cardinalityReal" in m)
    displayParts.push(`cardinality: ${m.cardinalityReal}`);
  // if ("query" in node.m && !eventSpan.dataset.queryAdded) {
  //   displayParts.push(`query: ${node.m.query}`);
  //   eventSpan.dataset.queryAdded = "true";
  // }

  if (displayParts.length > 0) {
    eventSpan.textContent += "  " + displayParts.join(" ");
  }
}

export function renderTreeWithTimeouts(treeData, container, slider) {
 
  scheduledEvents = [];

  const baseTime = timeLine[0].timestamp;
  const simEndTime = timeLine[timeLine.length - 1].timestamp;
  const duration = simEndTime - baseTime;

  treeData[0].isMainRoot = true;

  treeData.forEach((root) => {
    collectRenderEvents(root, container, baseTime);
  });

  slider.disabled = true;


  scheduledEvents.forEach((event) => {
    const delay = event.timestamp - baseTime;
    if (event.type === "node") {
      renderNodeProgressively(event.node, container);
    } else if (event.type === "event") {
      applyEventToNode(event.node, event.event);
    }
    const percent = (delay / duration) * 100;
    slider.setValue(percent);
  
  });

  setTimeout(() => {
    slider.value = 100;
    slider.disabled = false;
    // debugButton.disabled = false;
    // animateDebugButton(false);
  }, duration);
}




function renderNodeImmediately(node, parentElement) {
  if (isProjectWithOnlyServices(node)) {
    renderServiceSquares(node, parentElement);
    return;
  }

  const li = document.createElement("li");
  li.style.listStyleType = "none";
  li.classList.add("node");
  li.setAttribute("data-node-id", node.n);

  const contentSpan = document.createElement("span");
  contentSpan.className = "node-label";
  contentSpan.innerHTML = `<span class="timestamp">[${new Date(
    node.timestamp
  ).toLocaleTimeString()}]</span>  ${node.lo}`;

  const eventSpan = document.createElement("span");
  eventSpan.className = "event-inline";
  eventSpan.style.marginLeft = "10px";

  li.appendChild(contentSpan);
  li.appendChild(eventSpan);

  const ul = document.createElement("ul");
  ul.style.display = "block";
  li.appendChild(ul);
  parentElement.appendChild(li);


  node.events.forEach((evt) => {
    const m = evt.m;
    const displayParts = [];
    if ("timeLife" in m) displayParts.push(`time: ${m.timeLife}`);
    if ("cardinalityReal" in m)
      displayParts.push(`cardinality: ${m.cardinalityReal}`);
    if ("startAt" in m) li.classList.add("executing");
    if ("doneAt" in m) li.classList.remove("executing");

    if (displayParts.length > 0) {
      eventSpan.textContent += "  " + displayParts.join(" ");
    }
  });

  node.children.forEach((child) => {
    renderNodeImmediately(child, ul);
  });
}




export const timeLine = [];

function renderTreeSnapshot(treeData, container) {
  treeData.forEach((node) => {
    renderNodeImmediately(node, container);
  });
}




export function replayStateAt(currentTime) {
    // TODO remove this getElementById
  const snapshotContainer = document.getElementById("physical-plan-container");
  snapshotContainer.innerHTML = "";

  const partialData = timeLine.filter((d) => d.timestamp <= currentTime);

  const partialTree = tree.buildTree(partialData);

  renderTreeSnapshot(partialTree, snapshotContainer);
}


 
