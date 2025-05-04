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
import { ScrollArea } from "@/components/ui/scroll-area"; // Ensure ScrollArea is imported

const NO_TEXT_FOUND_MESSAGE = "NO_TEXT_FOUND"; // Constant for the specific message
const OCR_PROCESSING_ERROR_MESSAGE = "OCR_PROCESSING_ERROR"; // Constant for OCR processing failure
const MATH_AI_ERROR_PREFIX = "Error:"; // Standard prefix for errors from AI flows

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
      setIsLoadingCorrection(false); // Ensure correction loading is reset
      setIsLoadingSolution(false); // Ensure solution loading is reset
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
          // Basic check if conversion resulted in a valid string
           if (!imageDataUri || typeof imageDataUri !== 'string' || !imageDataUri.startsWith('data:image/')) {
              console.error("Failed to read file as data URI.");
              setError("Failed to process the image file. Please try again.");
              toast({
                  title: "File Read Error",
                  description: "Could not read the uploaded image.",
                  variant: "destructive",
              });
              setIsLoadingOcr(false);
              if (tempImageUrl && tempImageUrl.startsWith('blob:')) { URL.revokeObjectURL(tempImageUrl); }
              setImageUrl(null);
              setFile(null);
              return;
          }
          console.log("Image converted to data URI (first 100 chars):", imageDataUri.substring(0, 100));

          try {
              console.log("Calling extractMathText flow...");
              const ocrResult = await extractMathText({ imageDataUri });
              console.log("OCR Result:", ocrResult);

               // Handle potential null/undefined results explicitly
              if (!ocrResult || typeof ocrResult.extractedText !== 'string') {
                  throw new Error("Received invalid response from OCR service.");
              }

              const extracted = ocrResult.extractedText; // Flow should handle trimming

              if (extracted && extracted !== NO_TEXT_FOUND_MESSAGE && extracted !== OCR_PROCESSING_ERROR_MESSAGE) {
                  setOcrText(extracted);
                  toast({
                      title: "Text Extracted",
                      description: "Successfully extracted text from the image.",
                  });
                  // Automatically trigger correction after successful OCR
                  handleCorrection(extracted); // This will set isLoadingCorrection
              } else if (extracted === NO_TEXT_FOUND_MESSAGE) {
                  setOcrText(NO_TEXT_FOUND_MESSAGE);
                  setCorrectedText(''); // Ensure corrected text is also cleared
                  // Don't set a main error, let the text area display the message
                   toast({
                       title: "OCR Result",
                       description: "No mathematical text found in the image.",
                       variant: "default", // Use default variant, not an error
                   });
              } else { // Includes OCR_PROCESSING_ERROR_MESSAGE and potentially other unexpected empty cases
                  setOcrText(OCR_PROCESSING_ERROR_MESSAGE); // Use the specific error constant
                  setCorrectedText('');
                  const userMessage = "OCR processing failed. This might be due to image issues, network problems, or an internal error. Please try again or use a different image.";
                  setError(userMessage); // Set main error for visibility
                  toast({
                      title: "OCR Error",
                      description: "Failed to extract text from the image.", // Keep toast brief
                      variant: "destructive",
                  });
              }
          } catch (err) { // Catch errors from calling the flow function itself or processing its result
              console.error("Error during OCR processing:", err);
              const errorMsg = err instanceof Error ? err.message : "An unknown error occurred.";
              setError(`OCR Process Error: ${errorMsg}. Please try again.`); // More specific error
              setOcrText(OCR_PROCESSING_ERROR_MESSAGE); // Indicate processing error
              setCorrectedText('');
              toast({
                  title: "OCR Failed",
                  description: `An error occurred during text extraction.`, // Keep toast brief
                  variant: "destructive",
              });
          } finally {
              setIsLoadingOcr(false); // OCR process finished (success or fail)
              console.log("Finished OCR attempt.");
              // ImageUploader handles blob URL cleanup if necessary via its own effect
          }
      };
      reader.onerror = (errorEvent) => {
          console.error("Error reading file with FileReader:", errorEvent);
          setError("Failed to read the uploaded image file.");
          toast({
                title: "File Read Error",
                description: "Could not process the uploaded image file.",
                variant: "destructive",
            });
           if (tempImageUrl && tempImageUrl.startsWith('blob:')) {
               URL.revokeObjectURL(tempImageUrl);
           }
           setImageUrl(null);
           setFile(null);
           setIsLoadingOcr(false); // Ensure loading state is turned off
      };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); // Added handleCorrection dependency later

  const handleCorrection = useCallback(async (textToCorrect: string) => {
      // Check if the input is meaningful for correction
      if (!textToCorrect || textToCorrect === NO_TEXT_FOUND_MESSAGE || textToCorrect === OCR_PROCESSING_ERROR_MESSAGE) {
        console.warn("Skipping correction for input:", textToCorrect);
        setCorrectedText(''); // Clear corrected text if OCR failed or found nothing
        setIsLoadingCorrection(false); // Ensure this is off if skipped
        // Do not trigger solve if correction is skipped
        return;
      }

      setError(null); // Clear previous errors
      setIsLoadingCorrection(true);
      setSolution(''); // Clear previous solution
      console.log("Calling fixOcrErrors flow with text:", textToCorrect);

      try {
          const result = await fixOcrErrors({ ocrText: textToCorrect });
          console.log("Correction Result:", result);

          // Handle potential null/undefined results explicitly
          if (!result || typeof result.correctedText !== 'string') {
              throw new Error("Received invalid response from correction service.");
          }

          setCorrectedText(result.correctedText);
          toast({
             title: "Correction Attempted",
             description: result.correctedText !== textToCorrect
                ? "AI suggested corrections."
                : "AI reviewed the text, no changes needed.",
          });
          // Automatically trigger solve after successful correction attempt (even if no change)
          handleSolve(result.correctedText); // This will set isLoadingSolution

      } catch (err) { // Catch errors from calling the correction flow function or processing its result
          console.error("Error during correction process:", err);
          const errorMsg = err instanceof Error ? err.message : "An unknown error occurred.";
          setError(`Correction Process Error: ${errorMsg}. Please check the text or try again.`);
          setCorrectedText(textToCorrect); // Fallback to original OCR text on correction error
          toast({
              title: "Correction Failed",
              description: `Could not automatically correct the text.`, // Keep toast brief
              variant: "destructive",
          });
          // Do not automatically trigger solve if correction fails
      } finally {
          setIsLoadingCorrection(false);
          console.log("Finished correction attempt.");
      }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); // handleSolve dependency added later

  const handleSolve = useCallback(async (equation: string) => {
    const trimmedEquation = equation?.trim();

    // Check for invalid or non-mathematical inputs before calling the API
    if (!trimmedEquation || trimmedEquation === NO_TEXT_FOUND_MESSAGE || trimmedEquation === OCR_PROCESSING_ERROR_MESSAGE) {
        const reason = !trimmedEquation ? "it is empty" :
                       trimmedEquation === NO_TEXT_FOUND_MESSAGE ? "it indicates no text was found" :
                       "it indicates an OCR error occurred";
        const userMessage = `Cannot solve because the input expression ${reason}. Please upload a valid image or edit the text.`;
        // Don't set a main error, let the solution area display the message
        setSolution(`${MATH_AI_ERROR_PREFIX} ${userMessage}`); // Show error in solution area
        toast({
            title: "Invalid Input for Solver",
            description: userMessage,
            variant: "destructive",
        });
        setIsLoadingSolution(false); // Ensure loading is off
        return;
    }

    setError(null); // Clear previous errors
    setSolution('');
    setIsLoadingSolution(true);
    console.log("Calling solveMathExpression flow with equation:", trimmedEquation);
    try {
        const result = await solveMathExpression({ expression: trimmedEquation });
        console.log("Solver Result:", result);

        // Handle potential null/undefined results explicitly
        if (!result || typeof result.solution !== 'string') {
            throw new Error("Received invalid response from solver service.");
        }

        // The flow itself might return a solution starting with "Error:"
        setSolution(result.solution);
         toast({
              title: "Solution Processed",
              description: result.solution.startsWith(MATH_AI_ERROR_PREFIX)
                ? "Solver encountered an issue. See details below."
                : "Solution generated successfully.",
              variant: result.solution.startsWith(MATH_AI_ERROR_PREFIX) ? "destructive" : "default",
         });
    } catch (err) { // Catch errors from calling the solve flow function or processing its result
        console.error("Error during solving process:", err);
        const errorMsg = err instanceof Error ? err.message : "An unknown error occurred.";
        const solutionErrorMsg = `${MATH_AI_ERROR_PREFIX} An unexpected error occurred while trying to solve: ${errorMsg}`;
        setError(`Solver Process Error: ${errorMsg}.`); // Error for the alert box
        setSolution(solutionErrorMsg); // Error message in the solution area
         toast({
              title: "Solving Error",
              description: `Could not solve the equation due to an internal error.`, // Keep toast brief
              variant: "destructive",
          });
    } finally {
        setIsLoadingSolution(false);
        console.log("Finished solving attempt.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  // Add handleCorrection and handleSolve to the dependency array of handleImageUpload
  // Since they are defined using useCallback with dependencies, this should be safe.
  React.useEffect(() => {
      // This is just to make ESLint happy about dependencies in useCallback
  }, [handleImageUpload, handleCorrection, handleSolve]);


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
    // If user edits, clear the previous solution and error as they are likely invalid now
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
  const canSolve = correctedText && correctedText.trim() !== '' && correctedText !== NO_TEXT_FOUND_MESSAGE && correctedText !== OCR_PROCESSING_ERROR_MESSAGE;
  // Check if any process is currently running
  const isProcessing = isLoadingOcr || isLoadingCorrection || isLoadingSolution;

  return (
    <div className="container mx-auto p-4 md:p-8">
      <Card className="mb-6 shadow-lg rounded-lg border border-border">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center text-foreground">MathSnap Solver</CardTitle>
          <CardDescription className="text-center text-muted-foreground">
            Upload an image of a math problem (printed or handwritten), let AI extract & correct it, then solve!
          </CardDescription>
        </CardHeader>
      </Card>

      {error && (
          <Alert variant="destructive" className="mb-4 shadow-sm rounded-md border-destructive/50">
            <AlertTitle>Error Encountered</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

      {/* Use flex layout for columns on medium screens and up */}
      <div className="flex flex-col md:flex-row gap-6">

        {/* Image Upload Panel (Takes 1/3 width on md+) */}
        <Card className="shadow-md rounded-lg border border-border md:w-1/3 flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">1. Upload Image</CardTitle>
             <CardDescription>Drop or select a clear image of the math problem.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col flex-grow"> {/* Use flex-grow */}
            <ImageUploader
              onImageUpload={handleImageUpload}
              imageUrl={imageUrl}
              setImageUrl={setImageUrl}
              setFile={setFile}
              className="flex-grow mb-4" // Allow uploader to take space, add margin bottom
            />
             {isLoadingOcr && (
                <div className="mt-auto flex items-center justify-center text-muted-foreground"> {/* Push loader to bottom */}
                    <LoadingSpinner size={18} className="mr-2" />
                    <span>Extracting text...</span>
                </div>
             )}
          </CardContent>
        </Card>

        {/* OCR & Correction Panel (Takes 1/3 width on md+) */}
        <Card className="shadow-md rounded-lg border border-border md:w-1/3 flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">2. Verify & Solve</CardTitle>
             <CardDescription>
                View extracted text, edit if needed, then click Solve. Correction runs automatically.
             </CardDescription>
          </CardHeader>
          <CardContent className="relative flex flex-col flex-grow"> {/* Use flex-grow */}
            {(isLoadingOcr || isLoadingCorrection) && (
               <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-10 rounded-md p-4 text-center">
                 <LoadingSpinner />
                 <span className="ml-2 mt-2 text-muted-foreground">
                   {isLoadingOcr ? 'Extracting...' : 'AI correcting...'}
                 </span>
               </div>
            )}

            {/* Text Areas Container */}
            <div className="flex flex-col flex-grow gap-4 mb-4">
                 {/* Raw OCR Output */}
                 <div className="flex-1 flex flex-col">
                     <label htmlFor="ocrText" className="text-sm font-medium text-muted-foreground block mb-1">Raw OCR:</label>
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
                 {/* Editable Text */}
                 <div className="flex-1 flex flex-col">
                     <label htmlFor="correctedText" className="text-sm font-medium block mb-1">Editable & Corrected:</label>
                     <Textarea
                        id="correctedText"
                        value={correctedText}
                        onChange={handleTextChange}
                        placeholder={
                            isLoadingCorrection ? "Correcting..." :
                            ocrText && ocrText !== NO_TEXT_FOUND_MESSAGE && ocrText !== OCR_PROCESSING_ERROR_MESSAGE ? "Edit if needed, then Solve." :
                            ocrText === NO_TEXT_FOUND_MESSAGE ? "No text found to correct or solve." :
                            ocrText === OCR_PROCESSING_ERROR_MESSAGE ? "Cannot edit due to OCR error." :
                            "Upload image first..."
                         }
                        className="min-h-[100px] focus:ring-primary focus:border-primary resize-none flex-grow"
                        aria-label="Editable Corrected Text"
                        disabled={isProcessing || ((ocrText === OCR_PROCESSING_ERROR_MESSAGE || ocrText === NO_TEXT_FOUND_MESSAGE) && !correctedText)}
                     />
                 </div>
            </div>

            {/* Buttons at the bottom */}
            <div className="mt-auto flex flex-col sm:flex-row gap-2">
                {/* Removed 'Correct with AI' button as it runs automatically */}
                 <Button
                    onClick={() => handleSolve(correctedText)}
                    disabled={!canSolve || isProcessing}
                    className="flex-1" // Takes full width or half in sm+
                    aria-label="Solve the equation in the Editable Text box"
                >
                    <BrainCircuit className="mr-2 h-4 w-4" />
                    Solve Equation
                </Button>
            </div>
          </CardContent>
        </Card>

        {/* Solution Panel (Takes 1/3 width on md+) */}
        <Card className="shadow-md rounded-lg border border-border md:w-1/3 flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">3. Solution</CardTitle>
             <CardDescription>The AI-generated step-by-step solution.</CardDescription>
          </CardHeader>
          <CardContent className="relative flex flex-col flex-grow"> {/* Use flex-grow */}
            {isLoadingSolution && (
                 <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-10 rounded-md p-4 text-center">
                    <LoadingSpinner />
                    <span className="ml-2 mt-2 text-muted-foreground">Solving...</span>
                 </div>
            )}
            {/* Scrollable Solution Area */}
            <ScrollArea className="flex-grow border bg-secondary/30 p-4 rounded-md mb-4 min-h-[200px]"> {/* Use flex-grow */}
                {solution ? (
                    <pre className="text-sm font-mono whitespace-pre-wrap break-words text-foreground">{solution}</pre>
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-muted-foreground text-center">
                        {isProcessing ? 'Processing...' : // More generic loading state
                            canSolve ? 'Ready to solve. Click "Solve Equation".' :
                            !imageUrl ? 'Upload an image first.' :
                            ocrText === NO_TEXT_FOUND_MESSAGE ? 'No text found in image to solve.' :
                            ocrText === OCR_PROCESSING_ERROR_MESSAGE ? 'Cannot solve due to OCR error.' :
                            'Solution will appear here after solving.' // Default message
                        }
                        </p>
                    </div>
                )}
            </ScrollArea>
             {/* Clear All Button at the bottom */}
            <Button
                variant="outline"
                onClick={handleClearAll}
                className="w-full mt-auto" // Ensure it's at the bottom
                disabled={isProcessing}
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
