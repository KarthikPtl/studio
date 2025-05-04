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
const OCR_PROCESSING_ERROR_MESSAGE = "OCR_PROCESSING_ERROR"; // Constant for OCR processing failure

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

          try {
              console.log("Calling extractMathText flow...");
              const ocrResult = await extractMathText({ imageDataUri });
              console.log("OCR Result:", ocrResult);

              const extracted = ocrResult.extractedText; // No need to trim here, flow handles it

              if (extracted && extracted !== NO_TEXT_FOUND_MESSAGE && extracted !== OCR_PROCESSING_ERROR_MESSAGE) {
                  setOcrText(extracted);
                  toast({
                      title: "Text Extracted",
                      description: "Successfully extracted text from the image.",
                  });
                  // Automatically trigger correction after successful OCR
                  handleCorrection(extracted);
              } else if (extracted === NO_TEXT_FOUND_MESSAGE) {
                  setOcrText(NO_TEXT_FOUND_MESSAGE);
                  setCorrectedText(''); // Ensure corrected text is also cleared
                  setError("Could not find any mathematical text in the image. Please try a clearer image or one with a distinct math expression.");
                  toast({
                      title: "OCR Result",
                      description: "No mathematical text found.",
                      variant: "default",
                  });
                   setIsLoadingCorrection(false); // No correction needed
              } else { // Includes OCR_PROCESSING_ERROR_MESSAGE and potentially other unexpected null/empty cases
                  setOcrText(OCR_PROCESSING_ERROR_MESSAGE); // Use the specific error constant
                  setCorrectedText('');
                  const userMessage = extracted === OCR_PROCESSING_ERROR_MESSAGE
                    ? "OCR processing failed. Please try again or use a different image."
                    : "OCR failed unexpectedly. Please try again.";
                  setError(userMessage);
                  toast({
                      title: "OCR Error",
                      description: userMessage,
                      variant: "destructive",
                  });
                   setIsLoadingCorrection(false); // No correction possible
              }
          } catch (err) {
              console.error("Error calling extractMathText flow:", err);
              const errorMsg = err instanceof Error ? err.message : "An unknown error occurred.";
              setError(`OCR Error: ${errorMsg}.`);
              setOcrText(OCR_PROCESSING_ERROR_MESSAGE); // Indicate processing error
              setCorrectedText('');
              toast({
                  title: "OCR Error",
                  description: `An error occurred during text extraction: ${errorMsg}`,
                  variant: "destructive",
              });
              setIsLoadingCorrection(false); // No correction possible
          } finally {
              setIsLoadingOcr(false);
              console.log("Finished OCR process.");
              // ImageUploader handles blob URL cleanup
          }
      };
      reader.onerror = (error) => {
          console.error("Error reading file:", error);
          setError("Failed to read the uploaded image file.");
          setIsLoadingOcr(false);
          setIsLoadingCorrection(false);
           toast({
                title: "File Read Error",
                description: "Could not process the uploaded image file.",
                variant: "destructive",
            });
           if (tempImageUrl && tempImageUrl.startsWith('blob:')) {
               URL.revokeObjectURL(tempImageUrl);
           }
           setImageUrl(null);
      };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); // Added handleCorrection dependency later

  const handleCorrection = useCallback(async (textToCorrect: string) => {
      // Check if the input is meaningful for correction
      if (!textToCorrect || textToCorrect === NO_TEXT_FOUND_MESSAGE || textToCorrect === OCR_PROCESSING_ERROR_MESSAGE) {
        console.warn("Skipping correction for input:", textToCorrect);
        setCorrectedText(''); // Clear corrected text if OCR failed or found nothing
        setIsLoadingCorrection(false);
        return;
      }

      setError(null);
      setIsLoadingCorrection(true);
      setSolution('');
      console.log("Calling fixOcrErrors flow with text:", textToCorrect);

      try {
          const result = await fixOcrErrors({ ocrText: textToCorrect });
          console.log("Correction Result:", result);
          setCorrectedText(result.correctedText);
          toast({
             title: "Correction Attempted",
             description: result.correctedText !== textToCorrect
                ? "AI suggested corrections."
                : "AI reviewed the text, no changes needed.",
          });
          // Optional: Trigger solve after successful correction
          // handleSolve(result.correctedText);
      } catch (err) {
          console.error("Error correcting OCR text:", err);
          const errorMsg = err instanceof Error ? err.message : "An unknown error occurred.";
          setError(`Correction Error: ${errorMsg}. You can edit the text manually.`);
          setCorrectedText(textToCorrect); // Fallback to original OCR text on correction error
          toast({
              title: "Correction Failed",
              description: `Could not automatically correct the text: ${errorMsg}.`,
              variant: "destructive",
          });
      } finally {
          setIsLoadingCorrection(false);
          console.log("Finished correction process.");
      }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); // handleSolve dependency added later

  const handleSolve = useCallback(async (equation: string) => {
    const trimmedEquation = equation?.trim();

    // Check for invalid or non-mathematical inputs
    if (!trimmedEquation || trimmedEquation === NO_TEXT_FOUND_MESSAGE || trimmedEquation === OCR_PROCESSING_ERROR_MESSAGE) {
        const reason = !trimmedEquation ? "empty" : `"${trimmedEquation}" (Indicates OCR failure or no text found)`;
        setError(`Cannot solve. The input expression is ${reason}. Please upload a valid image or edit the text.`);
        toast({
            title: "Invalid Equation",
            description: `Cannot solve. Input is ${reason}.`,
            variant: "destructive",
        });
        setSolution(''); // Clear any previous solution
        setIsLoadingSolution(false);
        return;
    }

    setError(null);
    setSolution('');
    setIsLoadingSolution(true);
    console.log("Calling solveMathExpression flow with equation:", trimmedEquation);
    try {
        const result = await solveMathExpression({ expression: trimmedEquation });
        console.log("Solver Result:", result);
        setSolution(result.solution); // This might contain error messages from the solver AI too
         toast({
              title: "Solution Processed",
              description: result.solution.startsWith("Error:") ? "Solver encountered an issue. See details below." : "Solution generated successfully.",
              variant: result.solution.startsWith("Error:") ? "destructive" : "default",
         });
    } catch (err) {
        console.error("Error solving equation:", err);
        const errorMsg = err instanceof Error ? err.message : "An unknown error occurred.";
        setError(`Solver Error: ${errorMsg}.`);
        setSolution(`Error: An unexpected error occurred while calling the solver: ${errorMsg}`);
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
  }, [toast]);

  // Add handleCorrection and handleSolve to the dependency array of handleImageUpload
  // Since they are defined using useCallback with dependencies, this should be safe.
  React.useEffect(() => {
      // This is just to make ESLint happy about dependencies in useCallback
      // The actual functions handleImageUpload, handleCorrection, handleSolve
      // are stable due to useCallback.
  }, [handleCorrection, handleSolve]);


  const handleClearAll = () => {
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

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setCorrectedText(newText);
    if (solution) {
        setSolution('');
    }
    if (error) {
        setError(null);
    }
  };

  // Determine if the 'Correct with AI' button should be enabled
  const canCorrect = ocrText && ocrText !== NO_TEXT_FOUND_MESSAGE && ocrText !== OCR_PROCESSING_ERROR_MESSAGE;
  // Determine if the 'Solve Equation' button should be enabled
  const canSolve = correctedText && correctedText.trim() !== '';


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
              setImageUrl={setImageUrl}
              setFile={setFile}
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
          <CardContent className="relative flex flex-col flex-grow min-h-[300px]">
            {(isLoadingOcr || isLoadingCorrection) && (
               <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-10 rounded-md p-4 text-center">
                 <LoadingSpinner />
                 <span className="ml-2 mt-2 text-muted-foreground">
                   {isLoadingOcr ? 'Extracting from image...' : 'AI attempting correction...'}
                 </span>
               </div>
            )}

            <div className="flex flex-col flex-grow gap-4 mb-4">
                 <div className="flex-1 flex flex-col">
                     <label htmlFor="ocrText" className="text-sm font-medium text-muted-foreground block mb-1">Raw OCR Output:</label>
                     <Textarea
                        id="ocrText"
                        value={
                            ocrText === NO_TEXT_FOUND_MESSAGE ? "No mathematical text found." :
                            ocrText === OCR_PROCESSING_ERROR_MESSAGE ? "OCR processing error occurred." :
                            ocrText
                        }
                        readOnly
                        placeholder={isLoadingOcr ? "Extracting..." : "OCR output appears here..."}
                        className="min-h-[100px] bg-secondary/50 text-muted-foreground resize-none flex-grow"
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
                            ocrText && ocrText !== NO_TEXT_FOUND_MESSAGE && ocrText !== OCR_PROCESSING_ERROR_MESSAGE ? "Edit the text if needed or click Solve." :
                            ocrText === NO_TEXT_FOUND_MESSAGE ? "No text found to correct or solve." :
                            ocrText === OCR_PROCESSING_ERROR_MESSAGE ? "Correction unavailable due to OCR error." :
                            "Upload image first..."
                         }
                        className="min-h-[100px] focus:ring-primary focus:border-primary resize-none flex-grow"
                        aria-label="Editable Corrected Text"
                        disabled={isLoadingOcr || isLoadingCorrection || ocrText === OCR_PROCESSING_ERROR_MESSAGE || ocrText === NO_TEXT_FOUND_MESSAGE && !correctedText} // Disable if loading or if OCR failed/found nothing and field is empty
                     />
                 </div>
            </div>

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
                    <BrainCircuit className="mr-2 h-4 w-4" />
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
          <CardContent className="relative flex-grow flex flex-col min-h-[300px]">
            {isLoadingSolution && (
                 <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-10 rounded-md m-6 mt-0 mb-4 p-4 text-center">
                    <LoadingSpinner />
                    <span className="ml-2 mt-2 text-muted-foreground">Solving...</span>
                 </div>
            )}
            <div className="bg-secondary/30 p-4 rounded-md flex-grow overflow-auto min-h-[150px] mb-4">
              {solution ? (
                <pre className="text-sm font-mono whitespace-pre-wrap text-left w-full">{solution}</pre>
              ) : (
                <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground text-center">
                    {isLoadingSolution ? 'Calculating...' :
                        canSolve ? 'Ready to solve. Click "Solve Equation".' :
                        !imageUrl ? 'Upload an image first.' :
                        ocrText === NO_TEXT_FOUND_MESSAGE ? 'No text found in image to solve.' :
                        ocrText === OCR_PROCESSING_ERROR_MESSAGE ? 'Cannot solve due to OCR error.' :
                        'Solution will appear here.'
                    }
                    </p>
                </div>
              )}
            </div>
            <Button
                variant="outline"
                onClick={handleClearAll}
                className="w-full mt-auto"
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
