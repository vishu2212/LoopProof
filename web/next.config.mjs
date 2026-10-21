import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";

const localIps = Object.values(networkInterfaces())
  .flat()
  .filter((iface) => iface && iface.family === "IPv4" && !iface.internal)
  .map((iface) => iface.address);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The repo root has its own lockfile (Hardhat); pin Turbopack to this app.
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
  allowedDevOrigins: Array.from(
    new Set(["localhost", "127.0.0.1", "172.21.112.1", ...localIps]),
  ),
};

export default nextConfig;
