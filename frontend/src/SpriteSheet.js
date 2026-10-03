export class SpriteSheet {

    constructor(path) {
        this.path = path;
    }

    async getSVGDoc() {
        try {
            const response = await fetch(this.path);
            const svgText = await response.text();

            const parser = new DOMParser();
            return parser.parseFromString(svgText, "image/svg+xml");
        } catch (error) {
            console.error(error);
        }
    }
}