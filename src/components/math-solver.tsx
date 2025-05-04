"use client";

import React, { useState } from 'react';
import { fixOcrErrors } from '@/ai/flows/fix-ocr-errors';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ImageUploader } from '@/components/image-uploader';
import { LoadingSpinner } from '@/components/loading-spinner';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Wand2, Eraser } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

// Mock solver function - replace with actual Python backend call if needed later
// For now, we simulate solving common patterns.
const mockSolveEquation = async (equation: string): Promise<string> => {
  await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay

  // Simple mock logic
  if (equation.includes('^2')) { // Quadratic
      if (equation.trim() === 'x^2 + 5x + 6 = 0' || equation.trim() === 'x**2 + 5*x + 6 = 0') {
          return 'x = -2, x = -3';
      }
      return 'Solution: Quadratic detected (mock solution)';
  } else if (equation.includes('+') || equation.includes('-') || equation.includes('*') || equation.includes('/')) { // Linear or simple arithmetic
      if (equation.trim() === '2x + 3 = 9' || equation.trim() === '2*x + 3 = 9') {
          return 'x = 3';
      }
      if (equation.includes('x') && equation.includes('y')) { // System of equations
          if ( (equation.includes('x + y = 5') || equation.includes('x+y=5')) && (equation.includes('x - y = 1') || equation.includes('x-y=1'))) {
             return 'x = 3, y = 2';
          }
          return 'Solution: System of equations detected (mock solution)'
      }
       // Attempt basic eval for simple arithmetic if no variables
      if (!/[a-zA-Z]/.test(equation)) {
        try {
           // Basic safety: only allow numbers, operators, spaces, dots.
           if (/^[\d\s\+\-\*\/\.\(\)]+$/.test(equation.replace(/\s+/g, ''))) {
             // eslint-disable-next-line no-eval
             const result = eval(equation.replace('=', ''));
             return `Result: ${result}`;
           }
        } catch (e) {
            // Ignore eval errors
        }
      }
      return 'Solution: Linear or arithmetic detected (mock solution)';
  }
  return 'Solution: Cannot determine equation type (mock solution)';
};


export function MathSolver() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string>('');
  const [correctedText, setCorrectedText] = useState<string>('');
  const [solution, setSolution] = useState<string>('');
  const [isLoadingOcr, setIsLoadingOcr] = useState<boolean>(false);
  const [isLoadingCorrection, setIsLoadingCorrection] = useState<boolean>(false);
  const [isLoadingSolution, setIsLoadingSolution] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null); // Keep track of the file
  const { toast } = useToast();


  const handleImageUpload = async (uploadedFile: File) => {
      setError(null);
      setOcrText('');
      setCorrectedText('');
      setSolution('');
      setIsLoadingOcr(true);

      // --- Mock OCR ---
      // Simulate OCR extraction delay and provide mock text based on filename patterns
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate OCR processing time
      let mockOcrResult = "OCR couldn't read the image.";
      const name = uploadedFile.name.toLowerCase();
      if (name.includes('linear')) mockOcrResult = '2x + 3 = 9';
      else if (name.includes('quadratic')) mockOcrResult = 'x^2 + 5x + 6 = 0';
      else if (name.includes('system')) mockOcrResult = 'x + y = 5\nx - y = 1';
      else if (name.includes('handwritten_linear')) mockOcrResult = '2x + 4 = I0'; // Simulate OCR error
      else if (name.includes('handwritten_quadratic')) mockOcrResult = 'x^2 - 5x + 6 = O'; // Simulate OCR error
      // --- End Mock OCR ---

      setOcrText(mockOcrResult);
      setIsLoadingOcr(false);

      // Automatically trigger correction after OCR
      handleCorrection(mockOcrResult);
  };

  const handleCorrection = async (textToCorrect: string) => {
      if (!textToCorrect) {
        setError("No text to correct.");
        return;
      }
      setError(null);
      setIsLoadingCorrection(true);
      setSolution(''); // Clear previous solution when correcting

      try {
          const result = await fixOcrErrors({ ocrText: textToCorrect });
          setCorrectedText(result.correctedText);
          // Automatically trigger solving after correction
          handleSolve(result.correctedText);
      } catch (err) {
          console.error("Error correcting OCR text:", err);
          setError("Failed to correct OCR text. Please check the input or try again.");
          setCorrectedText(textToCorrect); // Fallback to original OCR text on error
          toast({
              title: "Correction Failed",
              description: "Could not automatically correct the text. You can edit it manually.",
              variant: "destructive",
          });
      } finally {
          setIsLoadingCorrection(false);
      }
  };


  const handleSolve = async (equation: string) => {
    if (!equation) {
        setError("No equation to solve.");
        return;
    }
    setError(null);
    setIsLoadingSolution(true);
    try {
        // Replace with actual backend call if implementing Python backend
        const result = await mockSolveEquation(equation);
        setSolution(result);
    } catch (err) {
        console.error("Error solving equation:", err);
        setError("Failed to solve the equation. Please ensure it's a valid format.");
         toast({
              title: "Solving Failed",
              description: "Could not solve the provided equation.",
              variant: "destructive",
          });
    } finally {
        setIsLoadingSolution(false);
    }
  };

  const handleClearAll = () => {
    setImageUrl(null);
    setFile(null);
    setOcrText('');
    setCorrectedText('');
    setSolution('');
    setError(null);
    setIsLoadingOcr(false);
    setIsLoadingCorrection(false);
    setIsLoadingSolution(false);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCorrectedText(e.target.value);
    // Clear solution when text is manually changed
    setSolution('');
  };

  return (
    <div className="container mx-auto p-4 md:p-8">
      <Card className="mb-6 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">MathSnap Solver</CardTitle>
          <CardDescription className="text-center text-muted-foreground">
            Upload an image of a math expression to get it solved.
          </CardDescription>
        </CardHeader>
      </Card>

      {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Image Upload Panel */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>1. Upload Image</CardTitle>
          </CardHeader>
          <CardContent>
            <ImageUploader
              onImageUpload={handleImageUpload}
              imageUrl={imageUrl}
              setImageUrl={setImageUrl}
              setFile={setFile}
            />
             {isLoadingOcr && (
                <div className="mt-4 flex items-center justify-center text-muted-foreground">
                    <LoadingSpinner className="mr-2" />
                    <span>Extracting text...</span>
                </div>
             )}
          </CardContent>
        </Card>

        {/* OCR & Correction Panel */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>2. Extracted & Corrected Text</CardTitle>
             <CardDescription>
                AI corrects common OCR errors. You can edit the text below before solving.
             </CardDescription>
          </CardHeader>
          <CardContent className="relative">
            {(isLoadingOcr || isLoadingCorrection) && (
               <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10 rounded-md">
                 <LoadingSpinner />
                 <span className="ml-2 text-muted-foreground">
                   {isLoadingOcr ? 'Extracting...' : 'Correcting...'}
                 </span>
               </div>
            )}
            <div className="mb-4">
                 <label htmlFor="ocrText" className="text-sm font-medium text-muted-foreground block mb-1">Original OCR Output:</label>
                 <Textarea
                    id="ocrText"
                    value={ocrText}
                    readOnly
                    placeholder="OCR output will appear here..."
                    className="min-h-[100px] bg-secondary/50 text-muted-foreground"
                    aria-label="Original OCR Output"
                 />
            </div>
            <div>
                 <label htmlFor="correctedText" className="text-sm font-medium block mb-1">Editable Corrected Text:</label>
                 <Textarea
                    id="correctedText"
                    value={correctedText}
                    onChange={handleTextChange}
                    placeholder="Corrected text will appear here. Edit if needed."
                    className="min-h-[150px] focus:ring-primary focus:border-primary"
                    aria-label="Editable Corrected Text"
                 />
            </div>

            <div className="mt-4 flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={() => handleCorrection(ocrText)}
                  disabled={!ocrText || isLoadingOcr || isLoadingCorrection || isLoadingSolution}
                  className="flex-1"
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  Correct with AI
                </Button>
                 <Button
                    onClick={() => handleSolve(correctedText)}
                    disabled={!correctedText || isLoadingOcr || isLoadingCorrection || isLoadingSolution}
                    className="flex-1"
                >
                    Solve Equation
                </Button>
            </div>
          </CardContent>
        </Card>

        {/* Solution Panel */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>3. Solution</CardTitle>
          </CardHeader>
          <CardContent className="relative min-h-[200px]">
            {isLoadingSolution && (
                 <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10 rounded-md">
                    <LoadingSpinner />
                    <span className="ml-2 text-muted-foreground">Solving...</span>
                 </div>
            )}
            <div className="bg-secondary/30 p-4 rounded-md min-h-[150px] flex items-center justify-center">
              {solution ? (
                <pre className="text-lg font-semibold whitespace-pre-wrap text-center">{solution}</pre>
              ) : (
                <p className="text-muted-foreground text-center">
                  {isLoadingSolution ? 'Calculating...' : 'Solution will appear here.'}
                </p>
              )}
            </div>
            <Button
                variant="outline"
                onClick={handleClearAll}
                className="w-full mt-4"
                disabled={isLoadingOcr || isLoadingCorrection || isLoadingSolution}
            >
                <Eraser className="mr-2 h-4 w-4" />
                Clear All
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
