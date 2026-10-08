import page from "./index.html";

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 3017,
  routes: { "/": page },
  development: false,
});

console.log(`Foldkit MDE playground: ${server.url}`);
