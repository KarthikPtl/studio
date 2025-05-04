
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import Image from 'next/image'; // Import Image component
import ReactMarkdown from 'react-markdown'; // Import react-markdown
import { fixOcrErrors } from '@/ai/flows/fix-ocr-errors';
import { extractMathText } from '@/ai/flows/extract-math-text';
import { solveMathExpression } from '@/ai/flows/solve-math-expression';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ImageUploader } from '@/components/image-uploader';
import { LoadingSpinner } from '@/components/loading-spinner';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Eraser, BrainCircuit } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

// Constants for specific messages from AI flows
const NO_TEXT_FOUND_MESSAGE = "NO_TEXT_FOUND";
const OCR_PROCESSING_ERROR_MESSAGE = "OCR_PROCESSING_ERROR";
const MATH_AI_ERROR_PREFIX = "**Error:**"; // Standard prefix for errors from AI flows (now bolded)

export function MathSolver() {
  const [imageUrl, setImageUrl] = useState<string | null>(null); // Original uploaded image preview URL
  const [preprocessedImageUrl, setPreprocessedImageUrl] = useState<string | null>(null); // Preprocessed image preview URL
  const [ocrText, setOcrText] = useState<string>(''); // Raw text from vision model
  const [correctedText, setCorrectedText] = useState<string>(''); // Text after correction/user edit, used for solving
  const [solution, setSolution] = useState<string>('');
  const [isLoadingOcr, setIsLoadingOcr] = useState<boolean>(false);
  const [isLoadingCorrection, setIsLoadingCorrection] = useState<boolean>(false);
  const [isLoadingSolution, setIsLoadingSolution] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const { toast } = useToast();

  // Centralized state derived from loading flags
  const isProcessing = isLoadingOcr || isLoadingCorrection || isLoadingSolution;

  // --- Flow Trigger Functions ---

  const triggerOcr = useCallback(async (imageDataUri: string, tempImageUrl: string) => {
    setIsLoadingOcr(true);
    setError(null);
    setOcrText('');
    setCorrectedText('');
    setSolution('');
    setPreprocessedImageUrl(null); // Reset preprocessed image

    console.log("Calling extractMathText flow...");
    try {
      const ocrResult = await extractMathText({ imageDataUri });
      console.log("OCR Result Received:", ocrResult);

      // Set preprocessed image URL if available in the result
      if (ocrResult?.preprocessedImageUri) {
          setPreprocessedImageUrl(ocrResult.preprocessedImageUri);
          console.log("Preprocessed image URI received.");
      } else {
          console.log("No preprocessed image URI received.");
      }

      if (!ocrResult || typeof ocrResult.extractedText !== 'string') {
        console.error("Received invalid or null response structure from OCR service.");
        setOcrText(OCR_PROCESSING_ERROR_MESSAGE);
        setError("An unexpected issue occurred during OCR processing (invalid response).");
        toast({ title: "OCR Error", description: "Invalid response from OCR service.", variant: "destructive" });
      } else {
        const extracted = ocrResult.extractedText;
        setOcrText(extracted); // Update raw OCR text state

        if (extracted === NO_TEXT_FOUND_MESSAGE) {
          toast({ title: "OCR Result", description: "No clear mathematical text found.", variant: "default" });
          setCorrectedText(''); // Clear corrected text too
        } else if (extracted === OCR_PROCESSING_ERROR_MESSAGE) {
          setError("OCR processing failed internally. Check image or try again.");
          toast({ title: "OCR Error", description: "Internal error during text extraction.", variant: "destructive" });
          setCorrectedText('');
        } else {
          toast({ title: "Text Extracted", description: "Successfully extracted text." });
          // Automatically trigger correction after successful OCR
          triggerCorrection(extracted); // Pass the raw OCR text
        }
      }
    } catch (err) {
      console.error("Error calling OCR processing flow:", err);
      const errorMsg = err instanceof Error ? err.message : "Unknown error.";
      setError(`OCR Process Error: Failed to communicate with AI (${errorMsg}).`);
      setOcrText(OCR_PROCESSING_ERROR_MESSAGE);
      toast({ title: "OCR Call Failed", description: "Could not reach text extraction service.", variant: "destructive" });
      setCorrectedText('');
    } finally {
      setIsLoadingOcr(false);
      console.log("Finished OCR attempt.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // triggerCorrection dependency removed temporarily to avoid infinite loops, added manually below


  const triggerCorrection = useCallback(async (textToCorrect: string) => {
    if (!textToCorrect || textToCorrect === NO_TEXT_FOUND_MESSAGE || textToCorrect === OCR_PROCESSING_ERROR_MESSAGE) {
      console.warn("Skipping correction for input:", textToCorrect);
      setCorrectedText(''); // Keep corrected text empty if OCR unusable
      setIsLoadingCorrection(false);
      return; // Don't proceed
    }

    setIsLoadingCorrection(true);
    setError(null); // Clear errors before correction attempt
    setSolution(''); // Clear previous solution
    console.log("Calling fixOcrErrors flow with text:", textToCorrect);

    try {
      const result = await fixOcrErrors({ ocrText: textToCorrect });
      console.log("Correction Result:", result);

      if (!result || typeof result.correctedText !== 'string') {
        console.error("Received invalid or null response from correction service.");
        setCorrectedText(textToCorrect); // Fallback to the raw OCR text
        toast({ title: "Correction Error", description: "Invalid response from correction service.", variant: "destructive" });
      } else {
        setCorrectedText(result.correctedText); // Update the editable/parsed text
        toast({
          title: "Correction Attempted",
          description: result.correctedText !== textToCorrect ? "AI suggested corrections." : "AI reviewed the text, no changes needed.",
        });
        // Correction success (or no changes needed), ready for potential solve
        // Solving is now triggered by the user via button click
      }
    } catch (err) {
      console.error("Error during correction process:", err);
      const errorMsg = err instanceof Error ? err.message : "Unknown error.";
      setError(`Correction Process Error: Failed to communicate with AI (${errorMsg}).`);
      setCorrectedText(textToCorrect); // Fallback to raw OCR on error
      toast({ title: "Correction Call Failed", description: "Could not reach correction service.", variant: "destructive" });
    } finally {
      setIsLoadingCorrection(false);
      console.log("Finished correction attempt.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);


  const handleSolve = useCallback(async (expressionToSolve: string) => {
    const trimmedExpression = expressionToSolve?.trim();

    if (!trimmedExpression || trimmedExpression === NO_TEXT_FOUND_MESSAGE || trimmedExpression === OCR_PROCESSING_ERROR_MESSAGE) {
      const reason = !trimmedExpression ? "it is empty" :
                     trimmedExpression === NO_TEXT_FOUND_MESSAGE ? "it indicates no text was found" :
                     "it indicates an error occurred earlier";
      const userMessage = `Cannot solve because the expression ${reason}. Please upload/edit first.`;
      setSolution(`${MATH_AI_ERROR_PREFIX} ${userMessage}`);
      toast({ title: "Invalid Input for Solver", description: userMessage, variant: "destructive" });
      setIsLoadingSolution(false);
      return;
    }

    setIsLoadingSolution(true);
    setError(null);
    setSolution(''); // Clear previous solution before starting
    console.log("Calling solveMathExpression flow with expression:", trimmedExpression);

    try {
      const result = await solveMathExpression({ expression: trimmedExpression });
      console.log("Solver Result (Markdown):", result);

      if (!result || typeof result.solution !== 'string') {
        console.error("Received invalid or null response from solver service.");
        const solutionErrorMsg = `${MATH_AI_ERROR_PREFIX} Solver error (invalid response).`;
        setError("Solver Error: Invalid response from service."); // Top alert
        setSolution(solutionErrorMsg); // Solution area message
        toast({ title: "Solving Error", description: "Invalid response from solver service.", variant: "destructive" });
      } else {
        setSolution(result.solution); // Display the received Markdown solution/error
        toast({
          title: "Solution Processed",
          description: result.solution.startsWith(MATH_AI_ERROR_PREFIX) ? "Solver encountered an issue." : "Solution generated.",
          variant: result.solution.startsWith(MATH_AI_ERROR_PREFIX) ? "destructive" : "default",
        });
      }
    } catch (err) {
      console.error("Error during solving process:", err);
      const errorMsg = err instanceof Error ? err.message : "Unknown error.";
      const displayError = `Solver Process Error: Failed to communicate with AI (${errorMsg}).`;
      const solutionErrorMsg = `${MATH_AI_ERROR_PREFIX} Unexpected error: Failed to reach AI service.`;
      setError(displayError); // Top alert
      setSolution(solutionErrorMsg); // Solution area message
      toast({ title: "Solving Call Failed", description: "Could not reach solving service.", variant: "destructive" });
    } finally {
      setIsLoadingSolution(false);
      console.log("Finished solving attempt.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  // --- Event Handlers ---

  const handleImageUpload = useCallback((uploadedFile: File) => {
    console.log("Starting image upload process...");
    setFile(uploadedFile); // Store file reference

    // Create temporary URL for immediate preview
    const tempImageUrl = URL.createObjectURL(uploadedFile);
    setImageUrl(tempImageUrl); // Shows image in the uploader

    // Reset states before processing new image
    setError(null);
    setOcrText('');
    setCorrectedText('');
    setSolution('');
    setPreprocessedImageUrl(null); // Reset preprocessed image URL

    // Convert file to data URI for Genkit Vision model
    const reader = new FileReader();
    reader.readAsDataURL(uploadedFile);

    reader.onload = () => {
      const imageDataUri = reader.result as string;
      if (!imageDataUri || typeof imageDataUri !== 'string' || !imageDataUri.startsWith('data:image/')) {
        console.error("Failed to read file as data URI.");
        setError("Failed to process the image file.");
        toast({ title: "File Read Error", description: "Could not read uploaded image.", variant: "destructive" });
        if (tempImageUrl && tempImageUrl.startsWith('blob:')) { URL.revokeObjectURL(tempImageUrl); }
        setImageUrl(null);
        setFile(null);
        return;
      }
      console.log("Image converted to data URI (first 100 chars):", imageDataUri.substring(0, 100) + "...");
      triggerOcr(imageDataUri, tempImageUrl); // Pass URI to start OCR flow
    };

    reader.onerror = (errorEvent) => {
      console.error("Error reading file with FileReader:", errorEvent);
      setError("Failed to read the uploaded image file.");
      toast({ title: "File Read Error", description: "Could not process image file.", variant: "destructive" });
      if (tempImageUrl && tempImageUrl.startsWith('blob:')) { URL.revokeObjectURL(tempImageUrl); }
      setImageUrl(null);
      setFile(null);
    };
  }, [toast, triggerOcr]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setCorrectedText(newText); // Update the state bound to the editable textarea
    // If user edits, clear the downstream solution and error
    if (solution) setSolution('');
    if (error && error.toLowerCase().includes('solver')) setError(null); // Clear solver-specific errors
  };

  const handleClearAll = () => {
    if (imageUrl && imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imageUrl);
    }
    // Assuming preprocessedImageUrl might also be a blob URL if generated client-side in the future
    if (preprocessedImageUrl && preprocessedImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(preprocessedImageUrl);
    }
    setImageUrl(null);
    setPreprocessedImageUrl(null); // Clear preprocessed image
    setFile(null);
    setOcrText('');
    setCorrectedText('');
    setSolution('');
    setError(null);
    setIsLoadingOcr(false);
    setIsLoadingCorrection(false);
    setIsLoadingSolution(false);
    console.log("Cleared all fields.");
    toast({ title: "Cleared", description: "All fields reset." });
  };

  // Dependencies setup for useCallback hooks
  useEffect(() => {
    // Manually link OCR and Correction to avoid potential loops if they were in deps array
    // This is a simplified approach; more robust state management might be better for complex dependencies.
  }, [triggerOcr, triggerCorrection, handleImageUpload, handleSolve]);


  // --- Derived State for UI ---

  // Display text for the raw OCR textarea
  const rawOcrDisplayText = ocrText === NO_TEXT_FOUND_MESSAGE ? "No clear mathematical text found in the image." :
                           ocrText === OCR_PROCESSING_ERROR_MESSAGE ? "OCR failed. Check image quality or try again." :
                           ocrText;

  // Placeholder for the editable textarea
  const correctedTextPlaceholder = isLoadingCorrection ? "AI correcting..." :
                                  ocrText && ocrText !== NO_TEXT_FOUND_MESSAGE && ocrText !== OCR_PROCESSING_ERROR_MESSAGE ? "Edit if needed, then Solve." :
                                  ocrText === NO_TEXT_FOUND_MESSAGE ? "No text found to correct or solve." :
                                  ocrText === OCR_PROCESSING_ERROR_MESSAGE ? "Cannot edit due to OCR error." :
                                  "Upload image first...";

   // Determine if the 'Solve' button should be enabled
   const canSolve = correctedText && correctedText.trim() !== '' && correctedText !== NO_TEXT_FOUND_MESSAGE && correctedText !== OCR_PROCESSING_ERROR_MESSAGE;


  // --- JSX ---
  return (
    <div className="container mx-auto p-4 md:p-8">
      <Card className="mb-6 shadow-lg rounded-lg border border-border">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center text-foreground">MathSnap Solver</CardTitle>
          <CardDescription className="text-center text-muted-foreground">
            Upload a math problem image, verify the text, and get the solution!
          </CardDescription>
        </CardHeader>
      </Card>

      {error && (
        <Alert variant="destructive" className="mb-4 shadow-sm rounded-md border-destructive/50">
          <AlertTitle>Error Encountered</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 1. Image Upload Panel */}
        <Card className="shadow-md rounded-lg border border-border flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">1. Upload Image</CardTitle>
            <CardDescription>Drop or select a clear image.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col flex-grow p-4">
            <ImageUploader
              onImageUpload={handleImageUpload}
              imageUrl={imageUrl}
              setImageUrl={setImageUrl}
              setFile={setFile}
              className="flex-grow mb-4 min-h-[250px]" // Uploader takes available space
            />
            {isLoadingOcr && (
              <div className="mt-auto flex items-center justify-center text-muted-foreground p-2">
                <LoadingSpinner size={18} className="mr-2" />
                <span>Extracting text...</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. Verify & Solve Panel */}
        <Card className="shadow-md rounded-lg border border-border flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">2. Verify & Solve</CardTitle>
            <CardDescription>Review OCR, Preprocessed Image, Edit, then Solve.</CardDescription>
          </CardHeader>
          <CardContent className="relative flex flex-col flex-grow p-4">
            {/* Unified Loading Overlay */}
            {(isLoadingOcr || isLoadingCorrection) && (
               <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-10 rounded-md p-4 text-center">
                 <LoadingSpinner />
                 <span className="ml-2 mt-2 text-muted-foreground">
                   {isLoadingOcr ? 'Processing Image...' : 'AI correcting...'}
                 </span>
               </div>
            )}

            {/* Text Areas & Preprocessed Image Container */}
            <div className="flex flex-col flex-grow gap-4 mb-4">
                 {/* Raw OCR Output (Readonly) */}
                 <div className="flex-1 flex flex-col">
                     <label htmlFor="ocrText" className="text-sm font-medium text-muted-foreground block mb-1">Raw OCR Result:</label>
                     <Textarea
                        id="ocrText"
                        value={rawOcrDisplayText} // Use derived display text
                        readOnly
                        placeholder={isLoadingOcr ? "Extracting..." : "Raw OCR output appears here..."}
                        className="min-h-[80px] bg-secondary/50 text-muted-foreground resize-none flex-grow"
                        aria-label="Raw OCR Output (Readonly)"
                     />
                 </div>

                 {/* Preprocessed Image Preview */}
                 <div className="flex-1 flex flex-col">
                    <label className="text-sm font-medium text-muted-foreground block mb-1">Preprocessed Image (if generated):</label>
                    <div className="border rounded-md p-2 bg-secondary/30 min-h-[100px] flex items-center justify-center">
                        {preprocessedImageUrl ? (
                            <Image
                                src={preprocessedImageUrl}
                                alt="Preprocessed Math Expression"
                                width={300}
                                height={150}
                                className="max-h-[150px] w-auto object-contain rounded-sm"
                                data-ai-hint="preprocessed math equation"
                            />
                        ) : (
                            <span className="text-xs text-muted-foreground">
                                {isLoadingOcr ? 'Generating...' : imageUrl ? 'No preprocessing applied or needed.' : 'Upload image first.'}
                            </span>
                        )}
                    </div>
                 </div>


                 {/* Parsed Expression (Editable) */}
                 <div className="flex-1 flex flex-col">
                     <label htmlFor="correctedText" className="text-sm font-medium block mb-1">Parsed Expression (Editable):</label>
                     <Textarea
                        id="correctedText"
                        value={correctedText} // Bound to the state updated by correction and user edits
                        onChange={handleTextChange}
                        placeholder={correctedTextPlaceholder} // Use derived placeholder
                        className="min-h-[80px] focus:ring-primary focus:border-primary resize-none flex-grow"
                        aria-label="Parsed Expression (Editable)"
                        disabled={isProcessing || !ocrText || ocrText === OCR_PROCESSING_ERROR_MESSAGE} // Disable if processing or OCR failed/empty
                     />
                 </div>
            </div>

            {/* Solve Button */}
            <div className="mt-auto">
                 <Button
                    onClick={() => handleSolve(correctedText)}
                    disabled={!canSolve || isProcessing} // Disable if not solvable or busy
                    className="w-full"
                    aria-label="Solve the expression in the Parsed Expression box"
                >
                    {isLoadingSolution ? <LoadingSpinner className="mr-2" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
                    Solve Expression
                </Button>
            </div>
          </CardContent>
        </Card>

        {/* 3. Solution Panel */}
        <Card className="shadow-md rounded-lg border border-border flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">3. Solution</CardTitle>
            <CardDescription>The AI-generated step-by-step solution.</CardDescription>
          </CardHeader>
          <CardContent className="relative flex flex-col flex-grow p-4">
             {/* Solution Loading Overlay (Specific to solving step) */}
             {isLoadingSolution && (
                 <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-10 rounded-md p-4 text-center">
                    <LoadingSpinner />
                    <span className="ml-2 mt-2 text-muted-foreground">Solving...</span>
                 </div>
             )}

            {/* Scrollable Solution Area */}
            <ScrollArea className="flex-grow border bg-secondary/30 p-4 rounded-md mb-4 min-h-[300px]">
                {solution ? (
                    <div className="prose prose-sm max-w-none text-foreground dark:prose-invert"> {/* Apply prose for Markdown styling */}
                      <ReactMarkdown>{solution}</ReactMarkdown>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-center text-muted-foreground">
                        {isProcessing && !isLoadingSolution ? 'Processing previous steps...' :
                         !imageUrl ? 'Upload an image first.' :
                         ocrText === NO_TEXT_FOUND_MESSAGE ? 'No text found to solve.' :
                         ocrText === OCR_PROCESSING_ERROR_MESSAGE ? 'Cannot solve due to OCR error.' :
                         !correctedText && !isProcessing ? 'Verify/Edit expression to solve.' : // If corrected is empty, but OCR wasn't error
                         'Solution will appear here after solving.' // Default ready state
                         }
                    </div>
                )}
            </ScrollArea>

             {/* Clear All Button */}
            <Button
                variant="outline"
                onClick={handleClearAll}
                className="w-full mt-auto"
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

