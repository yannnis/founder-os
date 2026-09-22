import { proxySubstack } from "@/lib/site/substack";

type Context = { params: Promise<{ path?: string[] }> };

async function handle(request: Request, context: Context) {
  const { path } = await context.params;
  return proxySubstack(request, path);
}

export const GET = handle;
export const POST = handle;
export const HEAD = handle;
