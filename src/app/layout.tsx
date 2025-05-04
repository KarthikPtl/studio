import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { Inter } from 'next/font/google'; // Import Inter
import 'katex/dist/katex.min.css'; // Import KaTeX CSS
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { Card, CardContent } from '@/components/ui/card';

// Configure Inter font
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter', // Define CSS variable
});

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
    <html lang="en" className={`${GeistSans.variable} ${inter.variable}`}>
      {/* Ensure no whitespace between <html> and <body> */}
      <body className={`antialiased bg-background text-foreground font-sans`}> {/* Use sans font family */}
        <header className="container mx-auto p-4 md:py-6">
           {/* Adjusted header styling: more padding, slightly less shadow */}
           <Card className="shadow-md rounded-xl border border-border bg-card">
             <CardContent className="p-5 md:p-6 text-center"> {/* Increased padding */}
              <h1 className="text-xl md:text-2xl font-semibold text-foreground tracking-tight"> {/* Use font-semibold */}
                 Math Snap Solver ✨
              </h1>
               <p className="text-sm md:text-base text-muted-foreground mt-1"> {/* Added margin-top */}
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
