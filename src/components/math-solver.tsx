
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { fixOcrErrors } from '@/ai/flows/fix-ocr-errors';
import { extractMathText } from '@/ai/flows/extract-math-text';
import { solveMathExpression } from '@/ai/flows/solve-math-expression';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ImageUploader } from '@/components/image-uploader';
import { LoadingSpinner } from '@/components/loading-spinner';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Eraser, BrainCircuit, Image as ImageIcon } from 'lucide-react'; // Replaced Files with ImageIcon
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

// List of upstream messages that should bypass correction/solving
const BYPASS_ALL_PROCESSING_MESSAGES = [
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
          console.log("No preprocessed image URI received, using original.");
          setPreprocessedImageUrl(imageDataUri); // Use original if none provided
      }

      if (!ocrResult || typeof ocrResult.fullText !== 'string') {
        console.error("Received invalid or null response structure from OCR service.");
        setOcrFullText(OCR_PROCESSING_ERROR_MESSAGE);
        setError("An unexpected issue occurred during OCR processing (invalid response).");
        toast({ title: "OCR Error", description: "Invalid response from OCR service.", variant: "destructive" });
      } else {
        const fullText = ocrResult.fullText;
        const expression = ocrResult.extractedExpression || null; // Ensure null if empty/undefined
        setOcrFullText(fullText);
        setOcrExpression(expression);

        if (fullText === NO_TEXT_FOUND_MESSAGE) {
          toast({ title: "OCR Result", description: "No readable text found in the image.", variant: "default" });
          setCorrectedFullText('');
          setCorrectedExpression(null);
        } else if (BYPASS_ALL_PROCESSING_MESSAGES.includes(fullText)) {
           const displayError = fullText.startsWith("API_") ? "API Error" :
                                fullText.startsWith("PREPROCESSING") ? "Preprocessing Error" :
                                fullText === OCR_BLOCKED_BY_SAFETY_MARKER ? "Blocked by Safety" :
                                "OCR Processing Error";
           setError(`OCR failed: ${displayError}. Check image, API key, or try again.`);
           toast({ title: "OCR Error", description: `Text extraction failed: ${displayError}`, variant: "destructive" });
           setCorrectedFullText('');
           setCorrectedExpression(null);
        } else {
          // Valid text found, set corrected state initially to raw OCR output
          setCorrectedFullText(fullText);
          setCorrectedExpression(expression);
          toast({ title: "Text Extracted", description: expression ? "Found text and a math expression." : "Found text." });
          // Correction is now triggered by button click
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
  }, [toast]); // Keep dependencies minimal

  const handleAiCorrection = useCallback(async () => {
    // Use the CURRENTLY displayed/edited text for correction
    const textToCorrect = correctedFullText;
    const expressionToCorrect = correctedExpression;

    if (!textToCorrect || BYPASS_ALL_PROCESSING_MESSAGES.includes(ocrFullText)) { // Check original OCR status
      console.warn("Skipping AI correction due to initial OCR status:", ocrFullText);
      toast({ title: "Correction Skipped", description: "Cannot run AI correction due to initial OCR error or no text.", variant: "destructive"});
      return;
    }

    setIsLoadingCorrection(true);
    setError(null);
    setSolution(''); // Clear solution when recorrecting
    console.log("Calling fixOcrErrors flow for AI correction...");

    try {
      const result = await fixOcrErrors({ ocrText: textToCorrect, ocrExpression: expressionToCorrect });
      console.log("AI Correction Result:", result);

      if (!result || typeof result.correctedText !== 'string') {
        console.error("Received invalid or null response from correction service.");
        // Don't revert, keep user edits if AI fails
        toast({ title: "Correction Error", description: "Invalid response from AI correction service.", variant: "destructive" });
      } else {
        setCorrectedFullText(result.correctedText);
        setCorrectedExpression(result.correctedExpression || null);
        const changesMade = result.correctedText !== textToCorrect || result.correctedExpression !== expressionToCorrect;
        toast({
          title: "AI Correction Applied",
          description: changesMade ? "AI has updated the text/expression." : "AI reviewed, no changes suggested.",
        });
      }
    } catch (err) {
      console.error("Error during AI correction process:", err);
      const errorMsg = err instanceof Error ? err.message : "Unknown error.";
      setError(`AI Correction Error: Failed to communicate with AI (${errorMsg}).`);
      // Don't revert on error
      toast({ title: "Correction Call Failed", description: "Could not reach AI correction service.", variant: "destructive" });
    } finally {
      setIsLoadingCorrection(false);
      console.log("Finished AI correction attempt.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correctedFullText, correctedExpression, ocrFullText, toast]); // Add ocrFullText dependency

  const handleSolve = useCallback(async () => {
    const context = correctedFullText?.trim();
    const expression = correctedExpression?.trim() || null;

    if (!context || BYPASS_ALL_PROCESSING_MESSAGES.includes(ocrFullText)) { // Check original OCR status
       const reason = !context ? "is empty" : "indicates an error occurred earlier";
       const userMessage = `Cannot solve because the text context ${reason}. Please upload/edit first.`;
       setSolution(`${MATH_AI_ERROR_PREFIX} ${userMessage}`);
       toast({ title: "Invalid Input for Solver", description: userMessage, variant: "destructive" });
       setIsLoadingSolution(false);
       return;
    }

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
  }, [correctedFullText, correctedExpression, ocrFullText, toast]); // Add ocrFullText dependency

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

  // No manual linking needed in useEffect

  // --- Derived State for UI ---

  const rawOcrDisplayFullText = isLoadingOcr ? "Extracting text..." :
                           ocrFullText === NO_TEXT_FOUND_MESSAGE ? "No readable text found." :
                           BYPASS_ALL_PROCESSING_MESSAGES.includes(ocrFullText) ? `OCR failed: ${ocrFullText}` :
                           ocrFullText ? ocrFullText : "Upload an image to start.";

  const rawOcrDisplayExpression = isLoadingOcr ? "Extracting..." :
                                  !ocrFullText || BYPASS_ALL_PROCESSING_MESSAGES.includes(ocrFullText) ? "N/A" :
                                  ocrExpression ? ocrExpression : "(No distinct expression found)";

  const correctedTextPlaceholder = isLoadingCorrection ? "AI correcting..." :
                                  ocrFullText && !BYPASS_ALL_PROCESSING_MESSAGES.includes(ocrFullText) ? "Edit full text if needed..." :
                                  ocrFullText === NO_TEXT_FOUND_MESSAGE ? "No text found to correct or edit." :
                                  BYPASS_ALL_PROCESSING_MESSAGES.includes(ocrFullText) ? "Cannot edit due to OCR error." :
                                  "Upload image first...";

  const correctedExpressionPlaceholder = isLoadingCorrection ? "AI correcting..." :
                                  ocrFullText && !BYPASS_ALL_PROCESSING_MESSAGES.includes(ocrFullText) ? "Edit expression if needed..." :
                                  ocrFullText === NO_TEXT_FOUND_MESSAGE ? "No expression found." :
                                  BYPASS_ALL_PROCESSING_MESSAGES.includes(ocrFullText) ? "N/A" :
                                  "Expression (if any) appears here...";

  const canSolve = correctedFullText && correctedFullText.trim() !== '' && !BYPASS_ALL_PROCESSING_MESSAGES.includes(ocrFullText);
  const canCorrect = correctedFullText && correctedFullText.trim() !== '' && !BYPASS_ALL_PROCESSING_MESSAGES.includes(ocrFullText);

  // --- JSX ---
  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">

      {error && (
        <Alert variant="destructive" className="mb-6 shadow-md rounded-lg border-destructive/60 bg-destructive/10">
          <AlertTitle className="font-semibold">Error Encountered</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">

        {/* --- Left Panel: Upload & Preview --- */}
        <Card className="shadow-lg rounded-xl border border-border/80 bg-card backdrop-blur-sm bg-opacity-80 flex flex-col h-full overflow-hidden">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-primary" />
              1. Upload Image
            </CardTitle>
            <CardDescription className="text-sm">Drop or select a clear image of your math problem.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col flex-grow p-4 md:p-6 items-center justify-center">
            <ImageUploader
              onImageUpload={handleImageUpload}
              imageUrl={imageUrl}
              setImageUrl={setImageUrl}
              setFile={setFile}
              className="flex-grow w-full mb-4 min-h-[200px] md:min-h-[250px] transition-all duration-300 ease-in-out hover:shadow-inner"
            />
            {isLoadingOcr && (
              <div className="mt-auto flex items-center justify-center text-muted-foreground p-2 text-sm">
                <LoadingSpinner size={16} className="mr-2 text-primary" />
                <span>Processing Image...</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* --- Middle Panel: Verify & Edit --- */}
        <Card className="shadow-lg rounded-xl border border-border/80 bg-card backdrop-blur-sm bg-opacity-80 flex flex-col h-full relative overflow-hidden">
          {(isLoadingOcr || isLoadingCorrection) && (
             <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-20 rounded-xl p-4 text-center backdrop-blur-sm">
               <LoadingSpinner className="text-primary" />
               <span className="mt-2 text-muted-foreground text-sm">
                 {isLoadingOcr ? 'Extracting Text...' : 'AI Correcting...'}
               </span>
             </div>
          )}
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-lg font-semibold">2. Verify & Edit Text</CardTitle>
            <CardDescription className="text-sm">Review the extracted text. Edit if needed before solving.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col flex-grow p-4 md:p-6 space-y-4">
            <ScrollArea className="flex-grow -mx-4 px-4"> {/* Full height scroll */}
              <div className="space-y-4">
                 {/* Raw OCR Full Text Output */}
                 <div>
                     <label htmlFor="ocrFullText" className="text-xs font-medium text-muted-foreground block mb-1">Raw OCR - Full Text</label>
                     <Textarea
                        id="ocrFullText"
                        value={rawOcrDisplayFullText}
                        readOnly
                        placeholder="Raw text from image..."
                        className="min-h-[60px] bg-muted/40 border-border/50 text-muted-foreground resize-none text-sm rounded-md shadow-inner"
                        aria-label="Raw OCR Full Text Output (Readonly)"
                     />
                 </div>

                 {/* Raw OCR Expression Output */}
                 <div>
                     <label htmlFor="ocrExpression" className="text-xs font-medium text-muted-foreground block mb-1">Raw OCR - Isolated Expression</label>
                     <Input
                        id="ocrExpression"
                        value={rawOcrDisplayExpression}
                        readOnly
                        placeholder="Expression..."
                        className="bg-muted/40 border-border/50 text-muted-foreground text-sm rounded-md shadow-inner"
                        aria-label="Raw OCR Isolated Expression (Readonly)"
                     />
                 </div>

                 {/* Preprocessed Image Preview */}
                 <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Preprocessed Image Preview</label>
                    <div className="border border-border/50 rounded-md p-2 bg-muted/30 min-h-[80px] flex items-center justify-center shadow-inner">
                        {preprocessedImageUrl ? (
                            <Image
                                src={preprocessedImageUrl}
                                alt="Preprocessed Math Problem"
                                width={250}
                                height={125}
                                className="max-h-[100px] w-auto object-contain rounded-sm"
                                data-ai-hint="preprocessed math text"
                            />
                        ) : (
                            <span className="text-xs text-muted-foreground text-center px-4">
                                {isLoadingOcr ? 'Generating preview...' : imageUrl ? 'Preview appears here.' : 'Upload image first.'}
                            </span>
                        )}
                    </div>
                 </div>

                 {/* Corrected/Editable Full Text */}
                 <div className="relative group">
                     <label htmlFor="correctedFullText" className="text-xs font-medium text-foreground block mb-1">Parsed Text (Editable)</label>
                     <Textarea
                        id="correctedFullText"
                        name="correctedFullText"
                        value={correctedFullText}
                        onChange={handleTextChange}
                        placeholder={correctedTextPlaceholder}
                        className="min-h-[80px] focus:ring-primary focus:border-primary resize-y text-sm rounded-md shadow-sm transition-shadow focus:shadow-md"
                        aria-label="Parsed Full Text (Editable)"
                        disabled={isProcessing || !ocrFullText || BYPASS_ALL_PROCESSING_MESSAGES.includes(ocrFullText)}
                     />
                 </div>

                 {/* Corrected/Editable Expression */}
                 <div className="relative group">
                     <label htmlFor="correctedExpression" className="text-xs font-medium text-foreground block mb-1">Parsed Expression (Editable)</label>
                     <Input
                        id="correctedExpression"
                        name="correctedExpression"
                        value={correctedExpression ?? ''} // Use ?? '' for controlled input
                        onChange={handleTextChange}
                        placeholder={correctedExpressionPlaceholder}
                        className="focus:ring-primary focus:border-primary text-sm rounded-md shadow-sm transition-shadow focus:shadow-md"
                        aria-label="Parsed Expression (Editable)"
                        disabled={isProcessing || !ocrFullText || BYPASS_ALL_PROCESSING_MESSAGES.includes(ocrFullText)}
                     />
                 </div>
              </div>
            </ScrollArea>

            <div className="mt-auto pt-4 space-y-2 border-t border-border/50"> {/* Buttons area */}
                 <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAiCorrection}
                    disabled={!canCorrect || isProcessing}
                    className="w-full text-xs"
                    aria-label="Attempt to automatically correct OCR errors using AI"
                 >
                    {isLoadingCorrection ? <LoadingSpinner size={14} className="mr-1" /> : <BrainCircuit className="mr-1 h-3.5 w-3.5" />}
                    Correct with AI
                 </Button>
                 <Button
                    onClick={handleSolve}
                    disabled={!canSolve || isProcessing}
                    className="w-full font-semibold"
                    aria-label="Solve the problem based on the parsed text"
                >
                    {isLoadingSolution ? <LoadingSpinner className="mr-2" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
                    Solve Problem
                </Button>
            </div>
          </CardContent>
        </Card>

        {/* --- Right Panel: Solution --- */}
        <Card className="shadow-lg rounded-xl border border-border/80 bg-card backdrop-blur-sm bg-opacity-80 flex flex-col h-full relative overflow-hidden">
           {isLoadingSolution && (
               <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-20 rounded-xl p-4 text-center backdrop-blur-sm">
                  <LoadingSpinner className="text-primary" />
                  <span className="mt-2 text-muted-foreground text-sm">Generating Solution...</span>
               </div>
           )}
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-lg font-semibold">3. Solution</CardTitle>
            <CardDescription className="text-sm">The step-by-step solution appears here.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col flex-grow p-4 md:p-6">
            <ScrollArea className="flex-grow border border-border/50 bg-secondary/30 p-4 rounded-lg mb-4 min-h-[250px] shadow-inner">
                <div className="prose prose-sm max-w-none text-foreground dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-li:my-0 prose-strong:text-primary prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted/30 prose-code:px-1 prose-code:py-0.5 prose-code:rounded-sm prose-code:font-normal">
                   {solution ? (
                     <ReactMarkdown
                       remarkPlugins={[remarkMath]}
                       rehypePlugins={[rehypeKatex]}
                     >
                       {solution}
                     </ReactMarkdown>
                   ) : (
                       <div className="flex items-center justify-center h-full text-center text-muted-foreground text-sm">
                           {isProcessing && !isLoadingSolution ? 'Processing previous steps...' :
                            !imageUrl ? 'Upload an image first.' :
                            ocrFullText === NO_TEXT_FOUND_MESSAGE ? 'No text found to solve.' :
                            BYPASS_ALL_PROCESSING_MESSAGES.includes(ocrFullText) ? 'Cannot solve due to OCR error.' :
                            !correctedFullText && !isProcessing ? 'Verify/Edit text, then click Solve.' :
                            'Solution will appear here after solving.'
                           }
                       </div>
                   )}
                </div>
            </ScrollArea>

            <Button
                variant="outline"
                onClick={handleClearAll}
                className="w-full mt-auto font-medium" // Button stays at bottom
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
