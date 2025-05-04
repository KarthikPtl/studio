"use client";

import React, { useState, useCallback } from 'react';
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

const NO_TEXT_FOUND_MESSAGE = "NO_TEXT_FOUND"; // Constant for the specific message
const OCR_ERROR_MESSAGE = "OCR Error."; // Constant for general OCR failure indication

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


  const handleImageUpload = useCallback(async (uploadedFile: File) => {
      setError(null);
      setOcrText('');
      setCorrectedText('');
      setSolution('');
      setIsLoadingOcr(true);
      setFile(uploadedFile); // Store file reference early

      console.log("Starting image upload process...");

      // Create temporary URL for immediate preview
      const tempImageUrl = URL.createObjectURL(uploadedFile);
      setImageUrl(tempImageUrl);

      // Convert file to data URI for Genkit Vision model
      const reader = new FileReader();
      reader.readAsDataURL(uploadedFile);

      reader.onload = async () => {
          const imageDataUri = reader.result as string;
          console.log("Image converted to data URI (first 100 chars):", imageDataUri.substring(0, 100));
          // Note: We don't set imageUrl state again here, already set with blob URL

          try {
              console.log("Calling extractMathText flow...");
              const ocrResult = await extractMathText({ imageDataUri });
              console.log("OCR Result:", ocrResult);

              const extracted = ocrResult.extractedText?.trim(); // Trim whitespace

              if (extracted && extracted !== NO_TEXT_FOUND_MESSAGE) {
                  setOcrText(extracted);
                  toast({
                      title: "Text Extracted",
                      description: "Successfully extracted text from the image.",
                  });
                  // Automatically trigger correction after successful OCR
                  // Pass the raw extracted text, even if it might be imperfect
                  handleCorrection(extracted);
              } else if (extracted === NO_TEXT_FOUND_MESSAGE) {
                  setOcrText(NO_TEXT_FOUND_MESSAGE); // Explicitly set state
                  setCorrectedText(''); // Ensure corrected text is also cleared
                  setError("Could not find any mathematical text in the image. Please try a clearer image or one with a distinct math expression.");
                  toast({
                      title: "OCR Result",
                      description: "No mathematical text found in the image.",
                      variant: "default", // Use default variant, it's not strictly an error
                  });
                  // No correction needed if no text found
                  setIsLoadingCorrection(false);
              } else {
                  // Handle unexpected empty or null result from the flow itself
                  setOcrText(OCR_ERROR_MESSAGE);
                  setCorrectedText('');
                  setError("OCR failed unexpectedly (empty response). Please try again.");
                  toast({
                      title: "OCR Error",
                      description: "Text extraction failed unexpectedly.",
                      variant: "destructive",
                  });
                   // No correction possible
                   setIsLoadingCorrection(false);
              }
          } catch (err) {
              console.error("Error extracting text:", err);
              const errorMsg = err instanceof Error ? err.message : "An unknown error occurred.";
              setError(`Failed to extract text: ${errorMsg}.`);
              setOcrText(OCR_ERROR_MESSAGE); // Indicate error in the textarea
              setCorrectedText('');
              toast({
                  title: "OCR Error",
                  description: `An error occurred during text extraction: ${errorMsg}`,
                  variant: "destructive",
              });
              // No correction possible
              setIsLoadingCorrection(false);
          } finally {
              setIsLoadingOcr(false);
              console.log("Finished OCR process.");
              // Clean up the temporary blob URL if it wasn't replaced by a data URI in state
              // (It is not replaced currently, so cleanup is needed)
              if (tempImageUrl && tempImageUrl.startsWith('blob:')) {
                  URL.revokeObjectURL(tempImageUrl);
                  // Optionally set imageUrl back to null if we only want data URIs,
                  // but blob URLs work fine for display. Let ImageUploader handle cleanup too.
              }
          }
      };
      reader.onerror = (error) => {
          console.error("Error reading file:", error);
          setError("Failed to read the uploaded image file.");
          setIsLoadingOcr(false);
          setIsLoadingCorrection(false); // Ensure correction loading stops too
           toast({
                title: "File Read Error",
                description: "Could not process the uploaded image file.",
                variant: "destructive",
            });
          // Clean up temporary URL on file read error
           if (tempImageUrl && tempImageUrl.startsWith('blob:')) {
               URL.revokeObjectURL(tempImageUrl);
           }
           setImageUrl(null); // Clear preview on error
      };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); // Added toast to dependency array, handleCorrection needs definition stability or inclusion

  const handleCorrection = useCallback(async (textToCorrect: string) => {
      // Check if the input is actually something that needs correction
      if (!textToCorrect || textToCorrect === NO_TEXT_FOUND_MESSAGE || textToCorrect === OCR_ERROR_MESSAGE) {
        console.warn("Skipping correction for input:", textToCorrect);
        // Set correctedText based on input, ensure consistency
        setCorrectedText(textToCorrect === NO_TEXT_FOUND_MESSAGE || textToCorrect === OCR_ERROR_MESSAGE ? '' : textToCorrect);
        setIsLoadingCorrection(false); // Ensure loading stops
        return; // Don't call the AI if there's nothing meaningful to correct
      }

      setError(null);
      setIsLoadingCorrection(true);
      setSolution(''); // Clear previous solution when starting correction
      console.log("Calling fixOcrErrors flow with text:", textToCorrect);

      try {
          const result = await fixOcrErrors({ ocrText: textToCorrect });
          console.log("Correction Result:", result);
          setCorrectedText(result.correctedText);
          toast({
             title: "Correction Attempted",
             description: "AI has processed the extracted text.",
             // Consider making variant conditional based on whether text changed
          });
          // Optional: Decide if auto-solve is desired after correction
          // handleSolve(result.correctedText);
      } catch (err) {
          console.error("Error correcting OCR text:", err);
          const errorMsg = err instanceof Error ? err.message : "An unknown error occurred.";
          setError(`Failed to correct text: ${errorMsg}. You can edit it manually.`);
          setCorrectedText(textToCorrect); // Fallback to original OCR text on error
          toast({
              title: "Correction Failed",
              description: `Could not automatically correct the text: ${errorMsg}. Please edit manually.`,
              variant: "destructive",
          });
      } finally {
          setIsLoadingCorrection(false);
          console.log("Finished correction process.");
      }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); // Added toast

  const handleSolve = useCallback(async (equation: string) => {
    const trimmedEquation = equation?.trim();

    // Check for invalid or non-mathematical inputs before calling the solver
    if (!trimmedEquation || trimmedEquation === NO_TEXT_FOUND_MESSAGE || trimmedEquation === OCR_ERROR_MESSAGE) {
        const reason = !trimmedEquation ? "empty" : `"${trimmedEquation}"`;
        setError(`Cannot solve. The input expression is ${reason}. Please provide a valid mathematical expression.`);
        toast({
            title: "Invalid Equation",
            description: `Input is ${reason}. Cannot solve.`,
            variant: "destructive",
        });
        setIsLoadingSolution(false); // Ensure loading stops
        return;
    }

    setError(null);
    setSolution(''); // Clear previous solution before solving
    setIsLoadingSolution(true);
    console.log("Calling solveMathExpression flow with equation:", trimmedEquation);
    try {
        const result = await solveMathExpression({ expression: trimmedEquation });
        console.log("Solver Result:", result);
        setSolution(result.solution); // This might contain error messages from the solver AI too
         toast({
              title: "Solution Processed",
              description: result.solution.startsWith("Error:") ? "Solver encountered an issue." : "The equation has been processed.",
              variant: result.solution.startsWith("Error:") ? "destructive" : "default",
         });
    } catch (err) {
        console.error("Error solving equation:", err);
        const errorMsg = err instanceof Error ? err.message : "An unknown error occurred.";
        setError(`Failed to solve the equation: ${errorMsg}.`);
        setSolution(`Error: An unexpected error occurred while calling the solver: ${errorMsg}`); // Show error in solution area
         toast({
              title: "Solving Error",
              description: `Could not solve the equation: ${errorMsg}`,
              variant: "destructive",
          });
    } finally {
        setIsLoadingSolution(false);
        console.log("Finished solving process.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); // Added toast

  const handleClearAll = () => {
    // Clean up potential blob URL from image preview
     if (imageUrl && imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageUrl);
    }
    setImageUrl(null);
    setFile(null);
    setOcrText('');
    setCorrectedText('');
    setSolution('');
    setError(null);
    setIsLoadingOcr(false);
    setIsLoadingCorrection(false);
    setIsLoadingSolution(false);
    console.log("Cleared all fields.");
     toast({
        title: "Cleared",
        description: "All fields have been reset.",
    });
  };

  // Callback for manual changes to the corrected text textarea
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setCorrectedText(newText);
    // Clear solution when text is manually changed, as it's no longer based on this text
    if (solution) {
        setSolution('');
    }
    // Optionally clear error if user starts typing to correct it
    if (error) {
        setError(null);
    }
  };

  // Determine if the 'Correct with AI' button should be enabled
  const canCorrect = ocrText && ocrText !== NO_TEXT_FOUND_MESSAGE && ocrText !== OCR_ERROR_MESSAGE;
  // Determine if the 'Solve Equation' button should be enabled
  const canSolve = correctedText && correctedText !== NO_TEXT_FOUND_MESSAGE && correctedText !== OCR_ERROR_MESSAGE;


  return (
    <div className="container mx-auto p-4 md:p-8">
      <Card className="mb-6 shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">MathSnap Solver</CardTitle>
          <CardDescription className="text-center text-muted-foreground">
            Upload an image of a math problem (printed or handwritten), let AI extract & correct it, then solve!
          </CardDescription>
        </CardHeader>
      </Card>

      {error && (
          <Alert variant="destructive" className="mb-4 shadow-sm rounded-md">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Image Upload Panel */}
        <Card className="shadow-md rounded-lg">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">1. Upload Image</CardTitle>
             <CardDescription>Drop or select a clear image of the math problem.</CardDescription>
          </CardHeader>
          <CardContent>
            <ImageUploader
              onImageUpload={handleImageUpload}
              imageUrl={imageUrl}
              setImageUrl={setImageUrl} // Pass setter for clearing
              setFile={setFile} // Pass setter for clearing
            />
             {isLoadingOcr && (
                <div className="mt-4 flex items-center justify-center text-muted-foreground">
                    <LoadingSpinner size={18} className="mr-2" />
                    <span>Extracting text...</span>
                </div>
             )}
          </CardContent>
        </Card>

        {/* OCR & Correction Panel */}
        <Card className="shadow-md rounded-lg flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">2. Extracted & Corrected Text</CardTitle>
             <CardDescription>
                View extracted text, AI correction, and edit if needed.
             </CardDescription>
          </CardHeader>
          <CardContent className="relative flex flex-col flex-grow min-h-[300px]"> {/* Ensure minimum height & flex-grow */}
             {/* Loading overlay */}
            {(isLoadingOcr || isLoadingCorrection) && (
               <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-10 rounded-md p-4 text-center">
                 <LoadingSpinner />
                 <span className="ml-2 mt-2 text-muted-foreground">
                   {isLoadingOcr ? 'Extracting from image...' : 'AI attempting correction...'}
                 </span>
               </div>
            )}

            {/* Textareas take available space */}
            <div className="flex flex-col flex-grow gap-4 mb-4">
                 <div className="flex-1 flex flex-col">
                     <label htmlFor="ocrText" className="text-sm font-medium text-muted-foreground block mb-1">Raw OCR Output:</label>
                     <Textarea
                        id="ocrText"
                        value={ocrText}
                        readOnly
                        placeholder={isLoadingOcr ? "Extracting..." : "OCR output appears here..."}
                        className="min-h-[100px] bg-secondary/50 text-muted-foreground resize-none flex-grow" // Use flex-grow
                        aria-label="Original OCR Output"
                     />
                 </div>
                 <div className="flex-1 flex flex-col">
                     <label htmlFor="correctedText" className="text-sm font-medium block mb-1">Editable Text:</label>
                     <Textarea
                        id="correctedText"
                        value={correctedText}
                        onChange={handleTextChange}
                        placeholder={
                            isLoadingCorrection ? "Correcting..." :
                            ocrText && ocrText !== NO_TEXT_FOUND_MESSAGE && ocrText !== OCR_ERROR_MESSAGE ? "Corrected text. Edit if needed." :
                            ocrText === NO_TEXT_FOUND_MESSAGE ? "No text found to correct." :
                            ocrText === OCR_ERROR_MESSAGE ? "Correction unavailable due to OCR error." :
                            "Upload image first..."
                         }
                        className="min-h-[100px] focus:ring-primary focus:border-primary resize-none flex-grow" // Use flex-grow
                        aria-label="Editable Corrected Text"
                        disabled={isLoadingOcr || isLoadingCorrection} // Disable while loading OCR/Correction
                     />
                 </div>
            </div>

            {/* Buttons at the bottom */}
            <div className="mt-auto flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={() => handleCorrection(ocrText)}
                  disabled={!canCorrect || isLoadingOcr || isLoadingCorrection || isLoadingSolution}
                  className="flex-1"
                  variant="outline"
                  aria-label="Attempt AI correction on the raw OCR text"
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  Correct with AI
                </Button>
                 <Button
                    onClick={() => handleSolve(correctedText)}
                    disabled={!canSolve || isLoadingOcr || isLoadingCorrection || isLoadingSolution}
                    className="flex-1"
                    aria-label="Solve the equation in the Editable Text box"
                >
                    <BrainCircuit className="mr-2 h-4 w-4" /> {/* Changed icon */}
                    Solve Equation
                </Button>
            </div>
          </CardContent>
        </Card>

        {/* Solution Panel */}
        <Card className="shadow-md rounded-lg flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">3. Solution</CardTitle>
             <CardDescription>The AI-powered solution or analysis.</CardDescription>
          </CardHeader>
          <CardContent className="relative flex-grow flex flex-col min-h-[300px]"> {/* Ensure minimum height & flex column */}
             {/* Loading overlay */}
            {isLoadingSolution && (
                 <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-10 rounded-md m-6 mt-0 mb-4 p-4 text-center">
                    <LoadingSpinner />
                    <span className="ml-2 mt-2 text-muted-foreground">Solving...</span>
                 </div>
            )}
            {/* Solution display area takes available space */}
            <div className="bg-secondary/30 p-4 rounded-md flex-grow overflow-auto min-h-[150px] mb-4"> {/* Min height for content, margin bottom */}
              {solution ? (
                // Using pre-wrap to respect formatting from the AI (line breaks, spaces)
                <pre className="text-sm font-mono whitespace-pre-wrap text-left w-full">{solution}</pre>
              ) : (
                <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground text-center">
                    {isLoadingSolution ? 'Calculating...' :
                        canSolve ? 'Ready to solve. Click "Solve Equation".' :
                        correctedText === '' && ocrText === '' ? 'Upload an image or enter text first.' :
                        'Solution will appear here.'
                    }
                    </p>
                </div>
              )}
            </div>
            {/* Clear button at the bottom */}
            <Button
                variant="outline"
                onClick={handleClearAll}
                className="w-full mt-auto" // Push to bottom
                disabled={isLoadingOcr || isLoadingCorrection || isLoadingSolution}
                aria-label="Clear all fields and the uploaded image"
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
