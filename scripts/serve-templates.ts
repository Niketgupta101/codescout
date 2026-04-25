#!/usr/bin/env -S TS_NODE_PROJECT=./scripts/plugins/ts-node-tsconfig.json TS_NODE_FILES=true node --watch -r ts-node/register -r tsconfig-paths/register -r dotenv/config

import express from "express";

void (async () => {
  const app = express();

  app.get("/hello-world", (req, res) => {
    res.write("Hello, world!");
  });

  app.listen(8081, () => console.log("Serving templates on http://localhost:8081"));
})();
