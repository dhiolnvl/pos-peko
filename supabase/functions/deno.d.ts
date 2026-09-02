// Ambient type definitions for Supabase Edge Functions (Deno runtime)
declare namespace Deno {
  export interface Env {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    has(key: string): boolean;
    toObject(): Record<string, string>;
  }
  export const env: Env;
  export function serve(
    handler: (req: Request) => Promise<Response> | Response,
    options?: { port?: number; signal?: AbortSignal; onError?: (error: unknown) => Response }
  ): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export * from '@supabase/supabase-js';
}

declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(
    handler: (req: Request) => Promise<Response> | Response,
    options?: { port?: number; signal?: AbortSignal; onError?: (error: unknown) => Response }
  ): void;
}

