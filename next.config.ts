import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Izinkan akses dev server dari HP di jaringan WiFi yang sama (hanya berlaku saat `npm run dev`)
  allowedDevOrigins: ["192.168.18.136", "192.168.*.*"],
};

export default nextConfig;
