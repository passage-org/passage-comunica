import pkg from "/package.json";

/// Display all the information about the version that
/// built the system. It should be statically generated, or at least call
/// on package.json to fill some of the information, like versions.
export class AboutGraph {

    graph = [
        ['<client>',           '<software>', '<yasgui>'],
        ['<client>',           '<software>', '<passage-communica>'],
        ['<comunica>',         '<version>',  '4.2.0'],
        ['<comunica>',         '<webpage>',  '<https://comunica.dev/>'],
        ['<passage>',          '<version>',  '0.2.0'],
        ['<passage>',          '<webpage>',  '<https://passage-org.github.io/>'],
        ['<passage-comunica>', '<extend>',   '<comunica>'],
        ['<passage-comunica>', '<webpage>',  '<https://passage-org.github.io/passage-comunica/>'],
        ['<server>',           '<software>', '<passage>'],
        ['<yasgui>',           '<webpage>',  'https://yasgui.triply.cc/'],
    ];
    
    constructor (container) {
        this.graph.push(['<yasgui>', '<version>',  pkg.dependencies["@triply/yasgui"]]);
        this.graph.push(['<passage-comunica>', '<version>',  pkg.version]);
        this.graph.push(['<passage-comunica>', '<license>',  pkg.license]);

        this.graph = this.graph.sort((a,b) => a[0].localeCompare(b[0]));

        const pre = document.createElement("pre");
        pre.textContent = this.graph.map(t => t.join(" ")).join("\n");
        container && container.prepend(pre);
    }
    
}
