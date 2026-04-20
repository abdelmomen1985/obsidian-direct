import { createInterface } from "readline";

const rl = createInterface({ input: process.stdin, output: process.stdout });

function prompt(q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, resolve));
}

const password = await prompt("Enter password: ");
if (!password || password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const hash = await Bun.password.hash(password, { algorithm: "argon2id" });
rl.close();

console.log("\nAdd this to your .env file:");
console.log(`AUTH_PASSWORD_HASH=${hash}`);
