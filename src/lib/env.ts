import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().url().optional(),

  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_CONNECT_CLIENT_ID: z.string().min(1).optional(),

  RNG_MASTER_SECRET: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "RNG_MASTER_SECRET must be 64 hex chars (32 bytes)")
    .optional(),

  ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((v) => v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)),

  BLOCKED_US_STATES: z
    .string()
    .default("")
    .transform((v) => v.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)),

  ALLOWED_COUNTRIES: z
    .string()
    .default("US")
    .transform((v) => v.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("[env] invalid environment:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables. See .env.example");
  }
  return parsed.data;
}

// Lazy singleton so build-time imports don't explode if a var is missing in CI.
let cached: ReturnType<typeof loadEnv> | null = null;
export function env() {
  if (!cached) cached = loadEnv();
  return cached;
}

// Publicly-safe subset for the client bundle.
export const publicEnv = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};
