import { routes, type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  headers: [
    // The finished videos are immutable once written — their paths carry a
    // random id, so they can be cached hard.
    routes.cacheControl("/f/(.*)", { public: true, maxAge: "1 hour" }),
  ],
};
