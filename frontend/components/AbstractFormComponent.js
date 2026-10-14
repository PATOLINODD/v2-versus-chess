import { AbstractComponent } from "./AbstractComponent.js";

export class AbstractFormComponent extends AbstractComponent {

    static name = "abstract-form";
    static observedAttributes = [];

    static formAssociated = true;

    constructor() {
        super();
        this._internals = this.attachInternals();
    }
}