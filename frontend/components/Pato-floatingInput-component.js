import { AbstractFormComponent } from "./AbstractFormComponent.js";

export class PatoFloatingInputComponent extends AbstractFormComponent {

    static name = "pato-floating-input";
    static observedAttributes = ["label", "type"]

    constructor() {
        super();
    }

    update() {}

    render() {
        const label = this.getAttribute("label") || "Type Here";
        const type = this.getAttribute("type") || "text"
        return this.html`
            <input id="${this.id}" type="${type}" placeholder=" ">
            <label for="${this.id}">${label}</label>
        `;
    }

    styles() {
        return this.css`
            * {
                box-sizing: border-box;
            }

            :host, input {
                width: 100%;
            }

            :host {
                position: relative;
                background-color: var(--bg);
                color: var(--text);
                transition: all .3s ease-out;
            }

            :host(:hover) {
                transform: scale(1.05);
            }
                
            :host(:hover) input:not(:focus) {
                border-color: var(--primary-color);
            }
            
            :host(:hover) label,
            :host(:hover) input:not(:focus):not(:placeholder-shown) + label {
                color: var(--primary-color);
            }

            input, label {
                transition: all .3s ease-out;
            }

            input {
                padding: 0.5rem 1rem 0.25rem;
                outline: none;
                border: var(--border);
                border-color: var(--text-muted, hsl(0 0% 70%));
                background: transparent;
                color: var(--text);


                &:focus {
                    border: 1px solid var(--primary-color);
                }

                &:not(:focus):not(:placeholder-shown) {
                    border-bottom: 1px solid var(--primary-color);
                }
            }


            label {
                position: absolute;
                top: 50%;
                left: 0.5rem;
                padding: 0.25rem;
                width: max-content;
                color: var(--text-muted, hsl(0 0% 70%));
                transform: translateY(-50%);
                transform-origin: left;

                pointer-events: none;
            }

            input:focus + label,
            input:not(:placeholder-shown) + label
            {
                top: 0;
                transform: translateY(-50%) scale(0.8);
                color: var(--primary-color, hsl(40 100% 50%));
                background-color: inherit;
            }

            input:not(:focus):not(:placeholder-shown) + label {
                color: var(--text-muted);
            }
        `;
    }
}