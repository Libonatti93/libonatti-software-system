import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv[2];

if (!password || password.length < 16) {
  console.error("Uso: npm run password -- 'uma-senha-com-16-ou-mais-caracteres'");
  process.exit(1);
}

const salt = randomBytes(24).toString("hex");
const hash = scryptSync(password, salt, 64).toString("hex");

console.log(`LIOS_PASSWORD_SALT=${salt}`);
console.log(`LIOS_PASSWORD_HASH=${hash}`);
