"use client";

import React, { useState } from 'react';
import { fixOcrErrors } from '@/ai/flows/fix-ocr-errors';
import { extractMathText } from '@/ai/flows/extract-math-text'; // Import new OCR flow
import { solveMathExpression } from '@/ai/flows/solve-math-expression'; // Import new solver flow
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ImageUploader } from '@/components/image-uploader';
import { LoadingSpinner } from '@/components/loading-spinner';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Wand2, Eraser, BrainCircuit } from 'lucide-react'; // Added BrainCircuit icon
import { useToast } from "@/hooks/use-toast";

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

      // Convert file to data URI for Genkit Vision model
      const reader = new FileReader();
      reader.readAsDataURL(uploadedFile);
      reader.onload = async () => {
          const imageDataUri = reader.result as string;
          setImageUrl(imageDataUri); // Set image preview immediately
          setFile(uploadedFile);

          try {
              // --- Real OCR Call ---
              const ocrResult = await extractMathText({ imageDataUri });
              setOcrText(ocrResult.extractedText || "OCR failed to extract text.");
              if (ocrResult.extractedText) {
                  // Automatically trigger correction after successful OCR
                  handleCorrection(ocrResult.extractedText);
              } else {
                   toast({
                      title: "OCR Failed",
                      description: "Could not extract text from the image.",
                      variant: "destructive",
                  });
              }
          } catch (err) {
              console.error("Error extracting text:", err);
              setError("Failed to extract text from the image. Please try again or ensure the image is clear.");
              setOcrText("OCR Error.");
              toast({
                  title: "OCR Error",
                  description: "An error occurred during text extraction.",
                  variant: "destructive",
              });
          } finally {
              setIsLoadingOcr(false);
          }
      };
      reader.onerror = (error) => {
          console.error("Error reading file:", error);
          setError("Failed to read the uploaded image file.");
          setIsLoadingOcr(false);
           toast({
                title: "File Read Error",
                description: "Could not process the uploaded image file.",
                variant: "destructive",
            });
      };
  };

  const handleCorrection = async (textToCorrect: string) => {
      if (!textToCorrect) {
        setError("No text to correct.");
        setIsLoadingCorrection(false); // Ensure loading stops if no text
        return;
      }
      setError(null);
      setIsLoadingCorrection(true);
      setSolution(''); // Clear previous solution when correcting

      try {
          const result = await fixOcrErrors({ ocrText: textToCorrect });
          setCorrectedText(result.correctedText);
          // Automatically trigger solving after correction
          // handleSolve(result.correctedText); // Optional: Decide if auto-solve is desired
      } catch (err) {
          console.error("Error correcting OCR text:", err);
          setError("Failed to correct OCR text. You can edit it manually.");
          setCorrectedText(textToCorrect); // Fallback to original OCR text on error
          toast({
              title: "Correction Failed",
              description: "Could not automatically correct the text. Please edit manually.",
              variant: "destructive",
          });
      } finally {
          setIsLoadingCorrection(false);
      }
  };


  const handleSolve = async (equation: string) => {
    if (!equation?.trim()) {
        setError("No equation to solve. Please upload an image or enter text.");
        return;
    }
    setError(null);
    setSolution(''); // Clear previous solution before solving
    setIsLoadingSolution(true);
    try {
        // --- Real Solver Call ---
        const result = await solveMathExpression({ expression: equation });
        setSolution(result.solution);
         toast({
              title: "Solution Found",
              description: "The equation has been solved.",
         });
    } catch (err) {
        console.error("Error solving equation:", err);
        const errorMsg = err instanceof Error ? err.message : "An unknown error occurred.";
        setError(`Failed to solve the equation: ${errorMsg}. Please check the format or try a different expression.`);
         toast({
              title: "Solving Failed",
              description: `Could not solve the equation. ${errorMsg}`,
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
            Upload an image of a math expression, let AI extract & correct it, then solve!
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
             <CardDescription>Upload a clear image of the math problem.</CardDescription>
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
                AI extracts text, then corrects common OCR errors. Edit below if needed.
             </CardDescription>
          </CardHeader>
          <CardContent className="relative flex flex-col h-full">
             {/* Loading overlay */}
            {(isLoadingOcr || isLoadingCorrection) && (
               <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10 rounded-md">
                 <LoadingSpinner />
                 <span className="ml-2 text-muted-foreground">
                   {isLoadingOcr ? 'Extracting...' : 'Correcting...'}
                 </span>
               </div>
            )}

            {/* Textareas take available space */}
            <div className="flex flex-col flex-grow gap-4">
                 <div className="flex-1">
                     <label htmlFor="ocrText" className="text-sm font-medium text-muted-foreground block mb-1">Original OCR Output:</label>
                     <Textarea
                        id="ocrText"
                        value={ocrText}
                        readOnly
                        placeholder="OCR output will appear here..."
                        className="min-h-[100px] bg-secondary/50 text-muted-foreground resize-none h-full"
                        aria-label="Original OCR Output"
                     />
                 </div>
                 <div className="flex-1">
                     <label htmlFor="correctedText" className="text-sm font-medium block mb-1">Editable Corrected Text:</label>
                     <Textarea
                        id="correctedText"
                        value={correctedText}
                        onChange={handleTextChange}
                        placeholder="Corrected text will appear here. Edit if needed."
                        className="min-h-[100px] focus:ring-primary focus:border-primary resize-none h-full"
                        aria-label="Editable Corrected Text"
                     />
                 </div>
            </div>

            {/* Buttons at the bottom */}
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={() => handleCorrection(ocrText)}
                  disabled={!ocrText || isLoadingOcr || isLoadingCorrection || isLoadingSolution}
                  className="flex-1"
                  variant="outline"
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  Correct with AI
                </Button>
                 <Button
                    onClick={() => handleSolve(correctedText)}
                    disabled={!correctedText || isLoadingOcr || isLoadingCorrection || isLoadingSolution}
                    className="flex-1"
                >
                    <BrainCircuit className="mr-2 h-4 w-4" /> {/* Changed icon */}
                    Solve Equation
                </Button>
            </div>
          </CardContent>
        </Card>

        {/* Solution Panel */}
        <Card className="shadow-md flex flex-col">
          <CardHeader>
            <CardTitle>3. Solution</CardTitle>
             <CardDescription>The AI-powered solution appears below.</CardDescription>
          </CardHeader>
          <CardContent className="relative flex-grow flex flex-col min-h-[200px]">
             {/* Loading overlay */}
            {isLoadingSolution && (
                 <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10 rounded-md m-6 mt-0 mb-4">
                    <LoadingSpinner />
                    <span className="ml-2 text-muted-foreground">Solving...</span>
                 </div>
            )}
            {/* Solution display area takes available space */}
            <div className="bg-secondary/30 p-4 rounded-md flex-grow flex items-center justify-center overflow-auto">
              {solution ? (
                <pre className="text-sm font-medium whitespace-pre-wrap text-left w-full">{solution}</pre>
              ) : (
                <p className="text-muted-foreground text-center">
                  {isLoadingSolution ? 'Calculating...' : 'Solution will appear here.'}
                </p>
              )}
            </div>
            {/* Clear button at the bottom */}
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
