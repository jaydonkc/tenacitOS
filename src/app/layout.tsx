import type { Metadata, Viewport } from "next";
import { Inter, Sora, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter",
});

const sora = Sora({ 
  subsets: ["latin"],
  variable: "--font-sora",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "Mission Control - OpenClaw",
  description: "Your OpenClaw agent dashboard",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1a1a2e",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ("serviceWorker" in navigator) {
                window.addEventListener("load", async () => {
                  const resetKey = "mc-sw-reset-v2";

                  try {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(registrations.map((registration) => registration.unregister()));

                    if ("caches" in window) {
                      const cacheNames = await caches.keys();
                      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
                    }

                    if (navigator.serviceWorker.controller && !sessionStorage.getItem(resetKey)) {
                      sessionStorage.setItem(resetKey, "1");
                      window.location.reload();
                    }
                  } catch (error) {
                    console.error("Failed to reset service workers:", error);
                  }
                });
              }
            `,
          }}
        />
      </head>
      <body 
        className={`${inter.variable} ${sora.variable} ${jetbrainsMono.variable} font-sans`}
        style={{ 
          backgroundColor: 'var(--background)', 
          color: 'var(--foreground)',
          fontFamily: 'var(--font-body)'
        }}
      >
        {children}
      </body>
    </html>
  );
}
