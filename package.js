Package.describe({
  summary: "A replacement hooks package with superior mongo support",
  version: "0.1.0",
  git: "https://github.com/znewsham/meteor-mongo-collection-hooks",
  name: "znewsham:mongo-collection-hooks"
});

Package.onUse((api) => {
  api.use([
    "ecmascript",
    "typescript",
    "mongo",
    "ddp",
    "minimongo",
    "ejson",
    "check",
    "random"
  ]);
  api.addAssets("types.d.ts", "server");
  api.mainModule("src/server/index.ts", "server", { lazy: true });
  api.mainModule("src/client/index.ts", "client", { lazy: true });
});


Package.onTest((api) => {
  api.use([
    "znewsham:mongo-collection-hooks",
    "typescript",
    "meteortesting:mocha"
  ]);
  api.mainModule("test/server.ts", "server");
  api.mainModule("test/client.ts", "client");
});
