
"use client";

import React, { useState, useCallback } from 'react';
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
import { Eraser, BrainCircuit, Image as ImageIcon, CheckCircle, HelpCircle, AlertCircle } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from '@/components/ui/progress'; // Import Progress
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"; // Import AlertDialog components


// Constants for specific messages from AI flows used in UI logic
const NO_TEXT_FOUND_MESSAGE = "NO_TEXT_FOUND";
const OCR_PROCESSING_ERROR_MESSAGE = "OCR_PROCESSING_ERROR";
const PREPROCESSING_ERROR_MARKER = "PREPROCESSING_ERROR";
const API_ERROR_INVALID_KEY_MARKER = "API_ERROR_INVALID_KEY";
const API_ERROR_QUOTA_MARKER = "API_ERROR_QUOTA";
const GENERAL_API_ERROR_MARKER = "API_GENERAL_ERROR";
const OCR_BLOCKED_BY_SAFETY_MARKER = "OCR_BLOCKED_BY_SAFETY";
const MATH_AI_ERROR_PREFIX = "**Error:**";
const MATH_AI_CONCLUSION_PREFIX = "**Conclusion:**";

// List of upstream messages that should bypass correction/solving
const BYPASS_ALL_PROCESSING_MESSAGES = [
    OCR_PROCESSING_ERROR_MESSAGE,
    PREPROCESSING_ERROR_MARKER,
    API_ERROR_INVALID_KEY_MARKER,
    API_ERROR_QUOTA_MARKER,
    GENERAL_API_ERROR_MARKER,
    OCR_BLOCKED_BY_SAFETY_MARKER,
];

// OCR Confidence Simulation
const MOCK_CONFIDENCE = 0.85; // Example confidence score (replace with actual if available)

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
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null); // State for confidence
  const [progress, setProgress] = useState<number>(0); // State for progress bar

  const { toast } = useToast();

  const isProcessing = isLoadingOcr || isLoadingCorrection || isLoadingSolution;

  // Simulate progress updates during OCR
  const simulateProgress = (duration: number) => {
    let startTime = Date.now();
    const interval = setInterval(() => {
      const elapsedTime = Date.now() - startTime;
      const calculatedProgress = Math.min(100, (elapsedTime / duration) * 100);
      setProgress(calculatedProgress);
      if (calculatedProgress >= 100) {
        clearInterval(interval);
        // Optional: set progress back to 0 after a short delay or on completion
        // setTimeout(() => setProgress(0), 500);
      }
    }, 100); // Update every 100ms

    return () => clearInterval(interval); // Cleanup function
  };

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
    setOcrConfidence(null); // Reset confidence
    setProgress(0); // Reset progress

    console.log("Calling extractMathText flow...");
    const cleanupProgress = simulateProgress(2000); // Simulate 2-second OCR

    try {
      const ocrResult = await extractMathText({ imageDataUri });
      console.log("OCR Result Received:", ocrResult);
      setProgress(100); // Ensure progress reaches 100 on completion

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
        setOcrConfidence(MOCK_CONFIDENCE); // Set mock confidence

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
      cleanupProgress(); // Clear the interval
      setIsLoadingOcr(false);
      console.log("Finished OCR attempt.");
      setTimeout(() => setProgress(0), 500); // Reset progress bar after a short delay
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
    const cleanupProgress = simulateProgress(3000); // Simulate 3-second solving

    try {
      const result = await solveMathExpression({ fullTextContext: context, expression: expression });
      console.log("Solver Result (Markdown):", result);
      setProgress(100); // Ensure progress reaches 100

      if (!result || typeof result.solution !== 'string') {
        console.error("Received invalid or null response from solver service.");
        const solutionErrorMsg = `${MATH_AI_ERROR_PREFIX} Solver error (invalid response).`;
        setError("Solver Error: Invalid response from service.");
        setSolution(solutionErrorMsg);
        toast({ title: "Solving Error", description: "Invalid response from solver service.", variant: "destructive" });
      } else {
        setSolution(result.solution);
        const isErrorSolution = result.solution.startsWith(MATH_AI_ERROR_PREFIX);
        const isConclusion = result.solution.startsWith(MATH_AI_CONCLUSION_PREFIX);
        toast({
          title: isErrorSolution ? "Solver Issue" : isConclusion ? "Solver Conclusion" : "Solution Generated",
          description: isErrorSolution ? "The solver reported an issue." : isConclusion ? "The solver reached a conclusion." : "Successfully generated solution.",
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
      cleanupProgress(); // Clear interval
      setIsLoadingSolution(false);
      console.log("Finished solving attempt.");
      setTimeout(() => setProgress(0), 500); // Reset progress bar after delay
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correctedFullText, correctedExpression, ocrFullText, toast]); // Add ocrFullText dependency

  // --- Event Handlers ---

  const handleImageUpload = useCallback((uploadedFile: File) => {
    console.log("Starting image upload process...");
    setFile(uploadedFile);

    const tempImageUrl = URL.createObjectURL(uploadedFile);
    setImageUrl(tempImageUrl); // Show preview immediately

    // Clear previous results
    setError(null);
    setOcrFullText('');
    setOcrExpression(null);
    setCorrectedFullText('');
    setCorrectedExpression(null);
    setSolution('');
    setPreprocessedImageUrl(null);
    setOcrConfidence(null);
    setProgress(0);

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
      triggerOcr(imageDataUri); // Trigger OCR after reading
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

  const performClearAll = () => {
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
    setOcrConfidence(null);
    setProgress(0);
    setIsLoadingOcr(false);
    setIsLoadingCorrection(false);
    setIsLoadingSolution(false);
    console.log("Cleared all fields.");
    toast({ title: "Cleared", description: "All fields reset." });
  };


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
        <Alert variant="destructive" className="mb-6 shadow-lg rounded-xl border-destructive/60 bg-destructive/10">
          <AlertCircle className="h-5 w-5" /> {/* Icon */}
          <AlertTitle className="font-semibold text-base">Error Encountered</AlertTitle>
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      {(isLoadingOcr || isLoadingCorrection || isLoadingSolution) && (
         <Progress value={progress} className="w-full h-1 mb-6 rounded-full bg-primary/20 [&>*]:bg-primary" />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">

        {/* --- Left Panel: Upload & Preview --- */}
        <Card className="shadow-lg rounded-2xl border border-border/50 bg-card flex flex-col h-full overflow-hidden transition-shadow hover:shadow-xl">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2 text-foreground">
              <ImageIcon className="w-5 h-5 text-primary" />
              1. Upload Image
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">Drop or select a clear image of your math problem.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col flex-grow p-4 md:p-6 items-center justify-center">
            <ImageUploader
              onImageUpload={handleImageUpload}
              imageUrl={imageUrl}
              setImageUrl={setImageUrl}
              setFile={setFile}
              className="flex-grow w-full mb-4 min-h-[200px] md:min-h-[250px] transition-all duration-300 ease-in-out hover:shadow-inner rounded-xl" // Increased radius
            />
            {isLoadingOcr && progress < 100 && (
              <div className="mt-auto flex items-center justify-center text-muted-foreground p-2 text-sm">
                <LoadingSpinner size={16} className="mr-2 text-primary" />
                <span>Processing Image ({Math.round(progress)}%)...</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* --- Middle Panel: Verify & Edit --- */}
        <Card className="shadow-lg rounded-2xl border border-border/50 bg-card flex flex-col h-full relative overflow-hidden transition-shadow hover:shadow-xl">
          {(isLoadingCorrection) && ( // Only show overlay for correction now
             <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-20 rounded-2xl p-4 text-center backdrop-blur-sm">
               <LoadingSpinner className="text-primary h-6 w-6" />
               <span className="mt-2 text-muted-foreground text-sm">
                 AI Correcting...
               </span>
             </div>
          )}
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-lg font-semibold text-foreground">2. Verify & Edit Text</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">Review the extracted text. Edit if needed before solving.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col flex-grow p-4 md:p-6 space-y-4">
            <ScrollArea className="flex-grow -mx-4 px-4"> {/* Full height scroll */}
              <div className="space-y-4">
                 {/* Raw OCR Full Text Output */}
                 <div className="relative group">
                     <label htmlFor="ocrFullText" className="text-xs font-medium text-muted-foreground block mb-1">Raw OCR - Full Text</label>
                     <Textarea
                        id="ocrFullText"
                        value={rawOcrDisplayFullText}
                        readOnly
                        placeholder="Raw text from image..."
                        className="min-h-[60px] bg-muted/30 border-border/50 text-muted-foreground resize-none text-sm rounded-lg shadow-inner" // Increased radius
                        aria-label="Raw OCR Full Text Output (Readonly)"
                     />
                      {/* Confidence Score */}
                     {ocrConfidence !== null && !isLoadingOcr && !BYPASS_ALL_PROCESSING_MESSAGES.includes(ocrFullText) && ocrFullText !== NO_TEXT_FOUND_MESSAGE && (
                       <div className="absolute bottom-1 right-2 text-xs text-muted-foreground bg-background/70 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                         {ocrConfidence > 0.8 ? <CheckCircle className="w-3 h-3 text-green-500" /> :
                          ocrConfidence > 0.5 ? <HelpCircle className="w-3 h-3 text-yellow-500" /> :
                          <AlertCircle className="w-3 h-3 text-red-500" />}
                         <span>Conf: {(ocrConfidence * 100).toFixed(0)}%</span>
                       </div>
                     )}
                 </div>

                 {/* Raw OCR Expression Output */}
                 <div>
                     <label htmlFor="ocrExpression" className="text-xs font-medium text-muted-foreground block mb-1">Raw OCR - Isolated Expression</label>
                     <Input
                        id="ocrExpression"
                        value={rawOcrDisplayExpression}
                        readOnly
                        placeholder="Expression..."
                        className="bg-muted/30 border-border/50 text-muted-foreground text-sm rounded-lg shadow-inner" // Increased radius
                        aria-label="Raw OCR Isolated Expression (Readonly)"
                     />
                 </div>

                 {/* Preprocessed Image Preview */}
                 <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Preprocessed Image Preview</label>
                    <div className="border border-border/50 rounded-lg p-2 bg-muted/20 min-h-[80px] flex items-center justify-center shadow-inner"> {/* Increased radius */}
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
                        className="min-h-[80px] focus:ring-primary focus:border-primary resize-y text-sm rounded-lg shadow-sm transition-shadow focus:shadow-md" // Increased radius
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
                        className="focus:ring-primary focus:border-primary text-sm rounded-lg shadow-sm transition-shadow focus:shadow-md" // Increased radius
                        aria-label="Parsed Expression (Editable)"
                        disabled={isProcessing || !ocrFullText || BYPASS_ALL_PROCESSING_MESSAGES.includes(ocrFullText)}
                     />
                 </div>
              </div>
            </ScrollArea>

            <div className="mt-auto pt-4 space-y-3 border-t border-border/50"> {/* Buttons area */}
                 <Button
                    variant="ghost" // Subtle variant
                    size="sm"
                    onClick={handleAiCorrection}
                    disabled={!canCorrect || isProcessing}
                    className="w-full text-xs text-primary hover:bg-primary/10 hover:text-primary rounded-lg" // Increased radius
                    aria-label="Attempt to automatically correct OCR errors using AI"
                 >
                    {isLoadingCorrection ? <LoadingSpinner size={14} className="mr-1" /> : <BrainCircuit className="mr-1 h-3.5 w-3.5" />}
                    Correct with AI
                 </Button>
                 <Button
                    onClick={handleSolve}
                    disabled={!canSolve || isProcessing}
                    className="w-full font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow-sm hover:shadow-md transition-all" // Primary button, increased radius
                    aria-label="Solve the problem based on the parsed text"
                >
                    {isLoadingSolution ? <LoadingSpinner className="mr-2" /> : <CheckCircle className="mr-2 h-4 w-4" />} {/* Use CheckCircle */}
                    Solve Problem
                </Button>
            </div>
          </CardContent>
        </Card>

        {/* --- Right Panel: Solution --- */}
        <Card className="shadow-lg rounded-2xl border border-border/50 bg-card flex flex-col h-full relative overflow-hidden transition-shadow hover:shadow-xl">
           {isLoadingSolution && progress < 100 && ( // Show overlay only while loading solution
               <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-20 rounded-2xl p-4 text-center backdrop-blur-sm">
                  <LoadingSpinner className="text-primary h-6 w-6" />
                  <span className="mt-2 text-muted-foreground text-sm">Generating Solution ({Math.round(progress)}%)...</span>
               </div>
           )}
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-lg font-semibold text-foreground">3. Solution</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">The step-by-step solution appears here.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col flex-grow p-4 md:p-6">
            <ScrollArea className="flex-grow border border-border/40 bg-muted/20 p-4 rounded-xl mb-4 min-h-[250px] shadow-inner"> {/* Increased radius, lighter background */}
                <div className="prose prose-sm max-w-none text-foreground dark:prose-invert prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1 prose-li:my-0.5 prose-strong:text-primary prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded-md prose-code:font-normal"> {/* Adjusted prose styles */}
                   {solution ? (
                     <ReactMarkdown
                       remarkPlugins={[remarkMath]}
                       rehypePlugins={[rehypeKatex]}
                     >
                       {solution}
                     </ReactMarkdown>
                   ) : (
                       <div className="flex items-center justify-center h-full text-center text-muted-foreground text-sm px-4">
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
             {/* Clear All Button with Confirmation */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                 <Button
                    variant="outline"
                    className="w-full mt-auto font-medium border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/50 rounded-lg" // Destructive outline, increased radius
                    disabled={isProcessing}
                    aria-label="Clear all fields and the uploaded image"
                 >
                    <Eraser className="mr-2 h-4 w-4" />
                    Clear All
                 </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-xl"> {/* Consistent radius */}
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently clear the uploaded image, extracted text, and solution.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={performClearAll} className="bg-destructive hover:bg-destructive/90 rounded-lg">
                    Confirm Clear
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
