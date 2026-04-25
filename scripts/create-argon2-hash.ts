#!/usr/bin/env -S node -r ts-node/register

import { hash } from "argon2";
import { randomBytes } from "crypto";

const passwordFromArgv = process.argv.find((it) => it.startsWith("--password="))?.slice("--password=".length);

void (async () => {
  const password = passwordFromArgv ?? randomBytes(8).toString("base64url");
  if (!passwordFromArgv) {
    console.log("Password:", password);
  }
  console.log("Password argon2 hash:", await hash(password));
})();
