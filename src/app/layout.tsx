import type { Metadata } from 'next';
import { Geist_Sans as GeistSans, Geist_Mono as GeistMono } from 'geist/font';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"; // Import Toaster


export const metadata: Metadata = {
  title: 'MathSnap Solver', // Updated title
  description: 'Upload an image of a math problem and get the solution.', // Updated description
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className={`antialiased`}>
        {children}
        <Toaster /> {/* Add Toaster component here */}
      </body>
    </html>
  );
}
