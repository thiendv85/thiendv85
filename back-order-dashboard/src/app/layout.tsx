import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { DataProvider } from "@/components/DataProvider";
import Navbar from "@/components/Navbar";
import CurrentUserGuard from "@/components/CurrentUserGuard";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Back Order Dashboard",
  description: "Production web dashboard for tracking back orders.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={`${inter.className} bg-slate-50 text-slate-900 antialiased`}>
        <DataProvider>
          <CurrentUserGuard>
            <div className="flex flex-col min-h-screen">
              <Navbar />
              <main className="flex-1 overflow-auto">
                {children}
              </main>
            </div>
          </CurrentUserGuard>
        </DataProvider>
      </body>
    </html>
  );
}
