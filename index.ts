import indexHtml from './frontend/index.html';

const server = Bun.serve({
    port: 3000,
    routes: {
        "/": indexHtml
    },
    async fetch(req) {
        const url = new URL(req.url);
        const file = Bun.file(`./frontend${url.pathname}`);
        
        if (await file.exists()) {
            return new Response(file);
        }
        
        return new Response("Not Found", { status: 404 });
    }
})

console.log(`Server running on: ${server.url}`);
