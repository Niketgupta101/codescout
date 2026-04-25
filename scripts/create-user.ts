#!/usr/bin/env -S node -r ts-node/register

import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";

const email = process.argv.find((it) => it.startsWith("--email="))?.slice("--email=".length);

const passwordFromArgv = process.argv.find((it) => it.startsWith("--password="))?.slice("--password=".length);

if (!email) {
  throw new Error("--email= option required");
}

void (async () => {
  const prisma = new PrismaClient();

  await prisma.$connect();

  const password = passwordFromArgv ?? randomBytes(8).toString("base64url");

  await prisma.user.create({
    data: {
      firstName: email.split("@").shift(),
      email,
      enabled: true,
      password: {
        create: {
          passwordHash: await hash(password),
        },
      },
    },
  });

  console.log("Created user");
  console.log("Email:", email);
  if (!passwordFromArgv) {
    console.log("Password:", password);
  }
})();
