import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    // URL de Postgres local de Supabase (puerto 54322 por defecto).
    url: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  },
});
