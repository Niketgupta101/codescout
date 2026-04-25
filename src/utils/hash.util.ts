import argon2 from "argon2";

export const createHash = async (value: string) => {
  return argon2.hash(value);
};

export const verifyHash = async (hash: string, value: string) => {
  return argon2.verify(hash, value);
};
