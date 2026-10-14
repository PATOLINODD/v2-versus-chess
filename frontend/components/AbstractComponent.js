export class AbstractComponent extends HTMLElement {

    static name = "abstract-component";
    static observedAttributes = [];

    constructor(){
        super();
        this.attachShadow({ mode: "open" });
        this.html = String.raw;
        this.css = String.raw;
    }

    connectedCallback(){
        this.shadowRoot.innerHTML = `
            <style>${this.styles()}</style>
            ${this.render()}
        `;
        this.update();
    }

    update() {}

    render() {
        throw new Error("This method must be implemented");
    }

    styles(){
        return ``;
    }

    static define(ClassComponent) {
        const tagName = ClassComponent.name;
        if(customElements.get(tagName)) throw new Error("Trying to define a tagName that already exists. Please, review the source code.");
        
        customElements.define(tagName, ClassComponent);
    }
}