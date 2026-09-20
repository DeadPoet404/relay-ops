import { config } from "dotenv";
// Match Next.js's relevant local precedence: process > .env.local > .env.
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
