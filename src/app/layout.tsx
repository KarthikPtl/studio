import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import 'katex/dist/katex.min.css'; // Import KaTeX CSS
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { Card, CardContent } from '@/components/ui/card'; // Import Card for header styling


export const metadata: Metadata = {
  title: 'MathSnap Solver',
  description: 'Upload an image of a math problem and get the solution.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className={`antialiased bg-background text-foreground`}>
        <header className="container mx-auto p-4 md:py-6">
           <Card className="shadow-md rounded-lg border border-border bg-card">
             <CardContent className="p-4 text-center">
              <h1 className="text-xl md:text-2xl font-bold text-foreground">
                 Math Snap Solver ✨
              </h1>
               <p className="text-sm md:text-base text-muted-foreground">
                 Snap It. Solve It. Understand It.
               </p>
             </CardContent>
           </Card>
         </header>
        <main>{children}</main>
        <Toaster /> {/* Add Toaster component here */}
      </body>
    </html>
  );
}
