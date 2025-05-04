
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import { fixOcrErrors } from '@/ai/flows/fix-ocr-errors';
import { extractMathText } from '@/ai/flows/extract-math-text';
import { solveMathExpression } from '@/ai/flows/solve-math-expression';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input'; // Import Input for corrected expression
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ImageUploader } from '@/components/image-uploader';
import { LoadingSpinner } from '@/components/loading-spinner';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Eraser, BrainCircuit, Files } from 'lucide-react'; // Added Files icon
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

// Constants for specific messages from AI flows used in UI logic
const NO_TEXT_FOUND_MESSAGE = "NO_TEXT_FOUND";
const OCR_PROCESSING_ERROR_MESSAGE = "OCR_PROCESSING_ERROR";
const PREPROCESSING_ERROR_MARKER = "PREPROCESSING_ERROR";
const API_ERROR_INVALID_KEY_MARKER = "API_ERROR_INVALID_KEY";
const API_ERROR_QUOTA_MARKER = "API_ERROR_QUOTA";
const GENERAL_API_ERROR_MARKER = "API_GENERAL_ERROR";
const OCR_BLOCKED_BY_SAFETY_MARKER = "OCR_BLOCKED_BY_SAFETY";
const MATH_AI_ERROR_PREFIX = "**Error:**";

// List of upstream messages that bypass correction/solving in the component UI
const BYPASS_CORRECTION_MESSAGES = [
    NO_TEXT_FOUND_MESSAGE,
    OCR_PROCESSING_ERROR_MESSAGE,
    PREPROCESSING_ERROR_MARKER,
    API_ERROR_INVALID_KEY_MARKER,
    API_ERROR_QUOTA_MARKER,
    GENERAL_API_ERROR_MARKER,
    OCR_BLOCKED_BY_SAFETY_MARKER,
];


export function MathSolver() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [preprocessedImageUrl, setPreprocessedImageUrl] = useState<string | null>(null);
  const [ocrFullText, setOcrFullText] = useState<string>(''); // Raw full text from vision model
  const [ocrExpression, setOcrExpression] = useState<string | null>(null); // Raw isolated expression
  const [correctedFullText, setCorrectedFullText] = useState<string>(''); // Corrected/edited full text
  const [correctedExpression, setCorrectedExpression] = useState<string | null>(null); // Corrected/edited expression
  const [solution, setSolution] = useState<string>('');
  const [isLoadingOcr, setIsLoadingOcr] = useState<boolean>(false);
  const [isLoadingCorrection, setIsLoadingCorrection] = useState<boolean>(false);
  const [isLoadingSolution, setIsLoadingSolution] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const { toast } = useToast();

  const isProcessing = isLoadingOcr || isLoadingCorrection || isLoadingSolution;

  // --- Flow Trigger Functions ---

  const triggerOcr = useCallback(async (imageDataUri: string) => {
    setIsLoadingOcr(true);
    setError(null);
    setOcrFullText('');
    setOcrExpression(null);
    setCorrectedFullText('');
    setCorrectedExpression(null);
    setSolution('');
    setPreprocessedImageUrl(null);

    console.log("Calling extractMathText flow...");
    try {
      const ocrResult = await extractMathText({ imageDataUri });
      console.log("OCR Result Received:", ocrResult);

      if (ocrResult?.preprocessedImageUri) {
          setPreprocessedImageUrl(ocrResult.preprocessedImageUri);
          console.log("Preprocessed image URI received.");
      } else {
          console.log("No preprocessed image URI received.");
          // Use the original image if preprocessing failed or wasn't performed
          setPreprocessedImageUrl(imageDataUri);
      }

      // Check primary output field 'fullText' for errors or valid text
      if (!ocrResult || typeof ocrResult.fullText !== 'string') {
        console.error("Received invalid or null response structure from OCR service.");
        setOcrFullText(OCR_PROCESSING_ERROR_MESSAGE); // Use fullText state for main status
        setError("An unexpected issue occurred during OCR processing (invalid response).");
        toast({ title: "OCR Error", description: "Invalid response from OCR service.", variant: "destructive" });
      } else {
        const fullText = ocrResult.fullText;
        const expression = ocrResult.extractedExpression || null; // Ensure null if empty/undefined
        setOcrFullText(fullText);
        setOcrExpression(expression);

        // Handle specific OCR outcomes
        if (fullText === NO_TEXT_FOUND_MESSAGE) {
          toast({ title: "OCR Result", description: "No readable text found in the image.", variant: "default" });
          setCorrectedFullText(''); // Clear corrected text as well
          setCorrectedExpression(null);
        } else if (BYPASS_CORRECTION_MESSAGES.includes(fullText)) {
           const displayError = fullText.startsWith("API_") ? "API Error" :
                                fullText.startsWith("PREPROCESSING") ? "Preprocessing Error" :
                                fullText === OCR_BLOCKED_BY_SAFETY_MARKER ? "Blocked by Safety" :
                                "OCR Processing Error";
           setError(`OCR failed: ${displayError}. Check image, API key, or try again.`);
           toast({ title: "OCR Error", description: `Text extraction failed: ${displayError}`, variant: "destructive" });
           setCorrectedFullText(''); // Clear corrected text
           setCorrectedExpression(null);
        } else {
          // Valid text found, trigger correction
          toast({ title: "Text Extracted", description: expression ? "Found text and a math expression." : "Found text (no distinct math expression)." });
          triggerCorrection(fullText, expression);
        }
      }
    } catch (err) {
      console.error("Error calling OCR processing flow:", err);
      const errorMsg = err instanceof Error ? err.message : "Unknown error.";
      setError(`OCR Process Error: Failed to communicate with AI (${errorMsg}).`);
      setOcrFullText(OCR_PROCESSING_ERROR_MESSAGE);
      setCorrectedFullText('');
      setCorrectedExpression(null);
      toast({ title: "OCR Call Failed", description: "Could not reach text extraction service.", variant: "destructive" });
    } finally {
      setIsLoadingOcr(false);
      console.log("Finished OCR attempt.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); // Dependencies updated below

  const triggerCorrection = useCallback(async (textToCorrect: string, expressionToCorrect: string | null) => {
    // Check only textToCorrect for bypass messages, as it's the primary indicator
    if (!textToCorrect || BYPASS_CORRECTION_MESSAGES.includes(textToCorrect)) {
      console.warn("Skipping correction due to upstream status:", textToCorrect);
      setCorrectedFullText(''); // Keep corrected states empty/null
      setCorrectedExpression(null);
      setIsLoadingCorrection(false);
      return;
    }

    setIsLoadingCorrection(true);
    setError(null);
    setSolution('');
    console.log("Calling fixOcrErrors flow...");

    try {
      const result = await fixOcrErrors({ ocrText: textToCorrect, ocrExpression: expressionToCorrect });
      console.log("Correction Result:", result);

      if (!result || typeof result.correctedText !== 'string') { // correctedExpression can be null
        console.error("Received invalid or null response from correction service.");
        setCorrectedFullText(textToCorrect); // Fallback to raw OCR
        setCorrectedExpression(expressionToCorrect);
        toast({ title: "Correction Error", description: "Invalid response from correction service.", variant: "destructive" });
      } else {
        setCorrectedFullText(result.correctedText);
        setCorrectedExpression(result.correctedExpression || null); // Ensure null if empty/falsy
        const changesMade = result.correctedText !== textToCorrect || result.correctedExpression !== expressionToCorrect;
        toast({
          title: "Correction Attempted",
          description: changesMade ? "AI reviewed and potentially corrected text/expression." : "AI reviewed text/expression, no changes needed.",
        });
        // Ready for potential solve, triggered by user button
      }
    } catch (err) {
      console.error("Error during correction process:", err);
      const errorMsg = err instanceof Error ? err.message : "Unknown error.";
      setError(`Correction Process Error: Failed to communicate with AI (${errorMsg}).`);
      setCorrectedFullText(textToCorrect); // Fallback to raw OCR on error
      setCorrectedExpression(expressionToCorrect);
      toast({ title: "Correction Call Failed", description: "Could not reach correction service.", variant: "destructive" });
    } finally {
      setIsLoadingCorrection(false);
      console.log("Finished correction attempt.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  const handleSolve = useCallback(async () => {
    // Use the corrected text as the primary input for context
    const context = correctedFullText?.trim();
    const expression = correctedExpression?.trim() || null; // Use corrected expression, ensure null if empty

    if (!context || BYPASS_CORRECTION_MESSAGES.includes(context)) {
       const reason = !context ? "is empty" : "indicates an error occurred earlier";
       const userMessage = `Cannot solve because the text context ${reason}. Please upload/edit first.`;
       setSolution(`${MATH_AI_ERROR_PREFIX} ${userMessage}`);
       toast({ title: "Invalid Input for Solver", description: userMessage, variant: "destructive" });
       setIsLoadingSolution(false);
       return;
    }
    // No need to check expression separately here, the solver flow handles null expression

    setIsLoadingSolution(true);
    setError(null);
    setSolution('');
    console.log("Calling solveMathExpression flow...");

    try {
      const result = await solveMathExpression({ fullTextContext: context, expression: expression });
      console.log("Solver Result (Markdown):", result);

      if (!result || typeof result.solution !== 'string') {
        console.error("Received invalid or null response from solver service.");
        const solutionErrorMsg = `${MATH_AI_ERROR_PREFIX} Solver error (invalid response).`;
        setError("Solver Error: Invalid response from service.");
        setSolution(solutionErrorMsg);
        toast({ title: "Solving Error", description: "Invalid response from solver service.", variant: "destructive" });
      } else {
        setSolution(result.solution);
        const isErrorSolution = result.solution.startsWith(MATH_AI_ERROR_PREFIX);
        toast({
          title: isErrorSolution ? "Solver Issue" : "Solution Generated",
          description: isErrorSolution ? "The solver reported an issue." : "Successfully generated solution.",
          variant: isErrorSolution ? "destructive" : "default",
        });
      }
    } catch (err) {
      console.error("Error during solving process:", err);
      const errorMsg = err instanceof Error ? err.message : "Unknown error.";
      const displayError = `Solver Process Error: Failed to communicate with AI (${errorMsg}).`;
      const solutionErrorMsg = `${MATH_AI_ERROR_PREFIX} Unexpected error: Failed to reach AI service.`;
      setError(displayError);
      setSolution(solutionErrorMsg);
      toast({ title: "Solving Call Failed", description: "Could not reach solving service.", variant: "destructive" });
    } finally {
      setIsLoadingSolution(false);
      console.log("Finished solving attempt.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correctedFullText, correctedExpression, toast]);

  // --- Event Handlers ---

  const handleImageUpload = useCallback((uploadedFile: File) => {
    console.log("Starting image upload process...");
    setFile(uploadedFile);

    const tempImageUrl = URL.createObjectURL(uploadedFile);
    setImageUrl(tempImageUrl);

    setError(null);
    setOcrFullText('');
    setOcrExpression(null);
    setCorrectedFullText('');
    setCorrectedExpression(null);
    setSolution('');
    setPreprocessedImageUrl(null);

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
      triggerOcr(imageDataUri);
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

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'correctedFullText') {
      setCorrectedFullText(value);
    } else if (name === 'correctedExpression') {
      setCorrectedExpression(value || null); // Set to null if empty
    }
    // Clear downstream solution/error on user edit
    if (solution) setSolution('');
    if (error && (error.toLowerCase().includes('solver') || error.toLowerCase().includes('solving'))) {
        setError(null); // Clear only solver-related errors on edit
    }
  };

  const handleClearAll = () => {
    if (imageUrl && imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imageUrl);
    }
    // Assume preprocessedImageUrl might also be a blob URL that needs cleanup
    if (preprocessedImageUrl && preprocessedImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(preprocessedImageUrl);
    }
    setImageUrl(null);
    setPreprocessedImageUrl(null);
    setFile(null);
    setOcrFullText('');
    setOcrExpression(null);
    setCorrectedFullText('');
    setCorrectedExpression(null);
    setSolution('');
    setError(null);
    setIsLoadingOcr(false);
    setIsLoadingCorrection(false);
    setIsLoadingSolution(false);
    console.log("Cleared all fields.");
    toast({ title: "Cleared", description: "All fields reset." });
  };

  // Manual dependency management (if needed, though often better handled by ESLint rules)
  useEffect(() => {
    // No explicit manual linking needed here with current structure
  }, [triggerOcr, triggerCorrection, handleSolve]);


  // --- Derived State for UI ---

  const rawOcrDisplayFullText = isLoadingOcr ? "Extracting text..." :
                           ocrFullText === NO_TEXT_FOUND_MESSAGE ? "No readable text found." :
                           BYPASS_CORRECTION_MESSAGES.includes(ocrFullText) ? `OCR failed: ${ocrFullText}` :
                           ocrFullText ? ocrFullText : "Upload an image to start.";

  const rawOcrDisplayExpression = isLoadingOcr ? "Extracting..." :
                                  !ocrFullText || BYPASS_CORRECTION_MESSAGES.includes(ocrFullText) ? "N/A" :
                                  ocrExpression ? ocrExpression : "(No distinct expression found)";

  const correctedTextPlaceholder = isLoadingCorrection ? "AI correcting..." :
                                  ocrFullText && !BYPASS_CORRECTION_MESSAGES.includes(ocrFullText) ? "Edit full text if needed..." :
                                  ocrFullText === NO_TEXT_FOUND_MESSAGE ? "No text found to correct." :
                                  BYPASS_CORRECTION_MESSAGES.includes(ocrFullText) ? "Cannot edit due to OCR error." :
                                  "Upload image first...";

  const correctedExpressionPlaceholder = isLoadingCorrection ? "AI correcting..." :
                                  ocrFullText && !BYPASS_CORRECTION_MESSAGES.includes(ocrFullText) ? "Edit expression if needed..." :
                                  ocrFullText === NO_TEXT_FOUND_MESSAGE ? "No expression found." :
                                   BYPASS_CORRECTION_MESSAGES.includes(ocrFullText) ? "N/A" :
                                  "Expression (if any) appears here...";

  // Determine if the 'Solve' button should be enabled - primarily based on having valid corrected text context
  const canSolve = correctedFullText && correctedFullText.trim() !== '' && !BYPASS_CORRECTION_MESSAGES.includes(correctedFullText);

  // --- JSX ---
  return (
    <div className="container mx-auto p-4 md:p-8">
      <Card className="mb-6 shadow-lg rounded-lg border border-border">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center text-foreground">MathSnap Solver</CardTitle>
          <CardDescription className="text-center text-muted-foreground">
            Upload a math problem (expression or word problem), verify the text, and get the solution!
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
        <Card className="shadow-md rounded-lg border border-border flex flex-col h-full"> {/* Ensure full height */}
          <CardHeader>
            <CardTitle className="text-lg font-semibold">1. Upload Image</CardTitle>
            <CardDescription>Drop or select a clear image.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col flex-grow p-4"> {/* flex-grow needed */}
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
        <Card className="shadow-md rounded-lg border border-border flex flex-col h-full"> {/* Ensure full height */}
          <CardHeader>
            <CardTitle className="text-lg font-semibold">2. Verify & Solve</CardTitle>
            <CardDescription>Review OCR, Preprocessed Image, Edit, then Solve.</CardDescription>
          </CardHeader>
          <CardContent className="relative flex flex-col flex-grow p-4">
            {(isLoadingOcr || isLoadingCorrection) && (
               <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-10 rounded-md p-4 text-center">
                 <LoadingSpinner />
                 <span className="ml-2 mt-2 text-muted-foreground">
                   {isLoadingOcr ? 'Processing Image...' : 'AI correcting...'}
                 </span>
               </div>
            )}

            {/* Use ScrollArea for the content inside Verify & Solve card */}
            <ScrollArea className="flex-grow mb-4 -mx-4 px-4"> {/* Adjust padding */}
              <div className="flex flex-col gap-4">
                 {/* Raw OCR Full Text Output (Readonly) */}
                 <div className="flex flex-col">
                     <label htmlFor="ocrFullText" className="text-sm font-medium text-muted-foreground block mb-1">Raw OCR - Full Text:</label>
                     <Textarea
                        id="ocrFullText"
                        name="ocrFullText"
                        value={rawOcrDisplayFullText}
                        readOnly
                        placeholder={isLoadingOcr ? "Extracting..." : "Raw full text output..."}
                        className="min-h-[80px] bg-secondary/50 text-muted-foreground resize-y"
                        aria-label="Raw OCR Full Text Output (Readonly)"
                     />
                 </div>

                 {/* Raw OCR Expression Output (Readonly) */}
                 <div className="flex flex-col">
                     <label htmlFor="ocrExpression" className="text-sm font-medium text-muted-foreground block mb-1">Raw OCR - Expression:</label>
                     <Input
                        id="ocrExpression"
                        name="ocrExpression"
                        value={rawOcrDisplayExpression}
                        readOnly
                        placeholder={isLoadingOcr ? "Extracting..." : "Isolated expression..."}
                        className="bg-secondary/50 text-muted-foreground"
                        aria-label="Raw OCR Isolated Expression (Readonly)"
                     />
                 </div>

                 {/* Preprocessed Image Preview */}
                 <div className="flex flex-col">
                    <label className="text-sm font-medium text-muted-foreground block mb-1">Preprocessed Image:</label>
                    <div className="border rounded-md p-2 bg-secondary/30 min-h-[100px] flex items-center justify-center">
                        {preprocessedImageUrl ? (
                            <Image
                                src={preprocessedImageUrl}
                                alt="Preprocessed Math Problem"
                                width={300}
                                height={150}
                                className="max-h-[150px] w-auto object-contain rounded-sm"
                                data-ai-hint="preprocessed math problem text"
                            />
                        ) : (
                            <span className="text-xs text-muted-foreground text-center">
                                {isLoadingOcr ? 'Generating...' : imageUrl ? 'No preprocessing applied or needed.' : 'Upload image first.'}
                            </span>
                        )}
                    </div>
                 </div>

                 {/* Corrected Full Text (Editable) */}
                 <div className="flex flex-col">
                     <label htmlFor="correctedFullText" className="text-sm font-medium block mb-1">Parsed Text (Editable):</label>
                     <Textarea
                        id="correctedFullText"
                        name="correctedFullText"
                        value={correctedFullText}
                        onChange={handleTextChange}
                        placeholder={correctedTextPlaceholder}
                        className="min-h-[80px] focus:ring-primary focus:border-primary resize-y"
                        aria-label="Parsed Full Text (Editable)"
                        disabled={isProcessing || !ocrFullText || BYPASS_CORRECTION_MESSAGES.includes(ocrFullText)}
                     />
                 </div>

                 {/* Corrected Expression (Editable) */}
                 <div className="flex flex-col">
                     <label htmlFor="correctedExpression" className="text-sm font-medium block mb-1">Parsed Expression (Editable):</label>
                     <Input
                        id="correctedExpression"
                        name="correctedExpression"
                        value={correctedExpression ?? ''} // Use ?? '' for controlled input
                        onChange={handleTextChange}
                        placeholder={correctedExpressionPlaceholder}
                        className="focus:ring-primary focus:border-primary"
                        aria-label="Parsed Expression (Editable)"
                        disabled={isProcessing || !ocrFullText || BYPASS_CORRECTION_MESSAGES.includes(ocrFullText)}
                     />
                 </div>
              </div>
            </ScrollArea>

            <div className="mt-auto"> {/* Button stays at bottom */}
                 <Button
                    onClick={handleSolve}
                    disabled={!canSolve || isProcessing}
                    className="w-full"
                    aria-label="Solve the problem described in the Parsed Text box"
                >
                    {isLoadingSolution ? <LoadingSpinner className="mr-2" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
                    Solve Problem
                </Button>
            </div>
          </CardContent>
        </Card>

        {/* 3. Solution Panel */}
        <Card className="shadow-md rounded-lg border border-border flex flex-col h-full"> {/* Ensure full height */}
          <CardHeader>
            <CardTitle className="text-lg font-semibold">3. Solution</CardTitle>
            <CardDescription>The AI-generated step-by-step solution.</CardDescription>
          </CardHeader>
          <CardContent className="relative flex flex-col flex-grow p-4">
             {isLoadingSolution && (
                 <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-10 rounded-md p-4 text-center">
                    <LoadingSpinner />
                    <span className="ml-2 mt-2 text-muted-foreground">Solving...</span>
                 </div>
             )}

            <ScrollArea className="flex-grow border bg-secondary/30 p-4 rounded-md mb-4 min-h-[300px]">
                {solution ? (
                   <div className="prose prose-sm max-w-none text-foreground dark:prose-invert prose-headings:my-2 prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-strong:text-primary">
                      <ReactMarkdown>{solution}</ReactMarkdown>
                   </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-center text-muted-foreground">
                        {isProcessing && !isLoadingSolution ? 'Processing previous steps...' :
                         !imageUrl ? 'Upload an image first.' :
                         ocrFullText === NO_TEXT_FOUND_MESSAGE ? 'No text found to solve.' :
                         BYPASS_CORRECTION_MESSAGES.includes(ocrFullText) ? 'Cannot solve due to OCR error.' :
                         !correctedFullText && !isProcessing ? 'Verify/Edit text to solve.' :
                         'Solution will appear here after solving.'
                         }
                    </div>
                )}
            </ScrollArea>

            <Button
                variant="outline"
                onClick={handleClearAll}
                className="w-full mt-auto" // Button stays at bottom
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

    