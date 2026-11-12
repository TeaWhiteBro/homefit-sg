import type { NextConfig } from "next";

// Local builds keep the normal Next.js output so `npm start` works.
// Docker and AWS Lambda builds set NEXT_OUTPUT=standalone and ship the minimal server bundle.
const projectRoot = process.cwd();

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  outputFileTracingRoot: projectRoot,
  turbopack: { root: projectRoot },
};

export default nextConfig;
