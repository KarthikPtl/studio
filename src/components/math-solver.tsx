
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
import { Eraser, BrainCircuit, Image as ImageIcon, CheckCircle, HelpCircle, AlertCircle, Info } from 'lucide-react'; // Added Info icon
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from '@/components/ui/progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";


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

// Define the type for confidence levels
type ConfidenceLevel = 'high' | 'medium' | 'low' | null;

// Function to get confidence level and icon
const getConfidenceDetails = (score: number | null): { level: ConfidenceLevel; icon: React.ReactNode; text: string } => {
    if (score === null) return { level: null, icon: null, text: '' };
    if (score > 0.85) return { level: 'high', icon: <CheckCircle className="w-3 h-3 text-green-500" />, text: `High Confidence (${(score * 100).toFixed(0)}%)` };
    if (score > 0.6) return { level: 'medium', icon: <HelpCircle className="w-3 h-3 text-yellow-500" />, text: `Medium Confidence (${(score * 100).toFixed(0)}%)` };
    return { level: 'low', icon: <AlertCircle className="w-3 h-3 text-red-500" />, text: `Low Confidence (${(score * 100).toFixed(0)}%) - Review recommended` };
};

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
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null); // State for confidence (0-1)
  const [progress, setProgress] = useState<number>(0); // State for progress bar

  const { toast } = useToast();

  const isProcessing = isLoadingOcr || isLoadingCorrection || isLoadingSolution;

  // Simulate progress updates
  const simulateProgress = (duration: number) => {
    let startTime = Date.now();
    setProgress(10); // Start immediately
    const interval = setInterval(() => {
      const elapsedTime = Date.now() - startTime;
      const calculatedProgress = Math.min(95, 10 + (elapsedTime / duration) * 85); // Simulate up to 95%
      setProgress(calculatedProgress);
      if (calculatedProgress >= 95) {
        clearInterval(interval);
      }
    }, 150); // Update slightly more frequently

    return () => {
        clearInterval(interval);
        setProgress(100); // Ensure it hits 100 on cleanup
        setTimeout(() => setProgress(0), 500); // Reset after completion
    };
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
    const cleanupProgress = simulateProgress(2500); // Simulate 2.5-second OCR/Preprocessing

    try {
      const ocrResult = await extractMathText({ imageDataUri });
      console.log("OCR Result Received:", ocrResult);


       if (ocrResult?.preprocessedImageUri) {
          setPreprocessedImageUrl(ocrResult.preprocessedImageUri);
          console.log("Preprocessed image URI received.");
      } else {
          console.warn("No preprocessed image URI received, using original.");
          setPreprocessedImageUrl(imageDataUri); // Use original if none provided
      }

      if (!ocrResult || typeof ocrResult.fullText !== 'string') {
        console.error("Received invalid or null response structure from OCR service.");
        setOcrFullText(OCR_PROCESSING_ERROR_MESSAGE);
        setError("An unexpected issue occurred during OCR processing (invalid response).");
        toast({ title: "OCR Error", description: "Invalid response from OCR service.", variant: "destructive" });
      } else {
        const fullText = ocrResult.fullText;
        // Ensure expression is null if it's empty string, null, or undefined
        const expression = (typeof ocrResult.extractedExpression === 'string' && ocrResult.extractedExpression.trim() !== '')
          ? ocrResult.extractedExpression.trim()
          : null;
        setOcrFullText(fullText);
        setOcrExpression(expression);
        // Set mock confidence based on whether text was found
        setOcrConfidence(fullText === NO_TEXT_FOUND_MESSAGE ? 0.1 : 0.85); // Example: Low if no text, high otherwise

        if (fullText === NO_TEXT_FOUND_MESSAGE) {
          toast({ title: "OCR Result", description: "No readable text found in the image.", variant: "default", icon: <Info className="h-5 w-5 text-blue-500" /> });
          setCorrectedFullText(''); // Explicitly clear corrected text
          setCorrectedExpression(null);
        } else if (BYPASS_ALL_PROCESSING_MESSAGES.includes(fullText)) {
           const displayError = fullText.startsWith("API_") ? "API Error" :
                                fullText.startsWith("PREPROCESSING") ? "Preprocessing Error" :
                                fullText === OCR_BLOCKED_BY_SAFETY_MARKER ? "Blocked by Safety Filters" :
                                "OCR Processing Error";
           setError(`OCR failed: ${displayError}. Details: ${fullText}. Check image, setup, or try again.`);
           toast({ title: "OCR Error", description: `Text extraction failed: ${displayError}`, variant: "destructive" });
           setCorrectedFullText('');
           setCorrectedExpression(null);
        } else {
          // Valid text found, set corrected state initially to raw OCR output
          setCorrectedFullText(fullText);
          setCorrectedExpression(expression);
          toast({ title: "Text Extracted", description: expression ? "Found text and a math expression." : "Found text, no distinct math expression isolated.", icon: <CheckCircle className="h-5 w-5 text-green-500" /> });
          // Correction is now triggered by button click or implicitly before solve
        }
      }
    } catch (err) {
      console.error("Error calling OCR processing flow:", err);
      const errorMsg = err instanceof Error ? err.message : "Unknown error.";
      setError(`OCR Process Error: Failed to communicate with AI (${errorMsg}).`);
      setOcrFullText(OCR_PROCESSING_ERROR_MESSAGE); // Set status even on comms error
      setCorrectedFullText('');
      setCorrectedExpression(null);
      toast({ title: "OCR Call Failed", description: "Could not reach text extraction service.", variant: "destructive" });
    } finally {
      cleanupProgress(); // Clear the interval and finalize progress
      setIsLoadingOcr(false);
      console.log("Finished OCR attempt.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); // Keep dependencies minimal

  const handleAiCorrection = useCallback(async () => {
    // Use the CURRENTLY displayed/edited text for correction
    const textToCorrect = correctedFullText;
    const expressionToCorrect = correctedExpression;

    // Allow correction even if original OCR had errors, using the potentially edited text
    if (!textToCorrect) {
        toast({ title: "Correction Skipped", description: "No text available to correct.", variant: "destructive"});
        return;
    }
    // Check if the *original* OCR result was an error that should bypass processing
    if (BYPASS_ALL_PROCESSING_MESSAGES.includes(ocrFullText)) {
      console.warn("Attempting correction despite initial OCR status being an error:", ocrFullText);
      toast({ title: "Correction Warning", description: `Attempting AI correction, but initial OCR had status: ${ocrFullText}. Results might be unreliable.`, variant: "default"});
    }

    setIsLoadingCorrection(true);
    setError(null); // Clear previous errors
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
        // Ensure expression is null if empty string returned
         const correctedExpr = (typeof result.correctedExpression === 'string' && result.correctedExpression.trim() !== '')
            ? result.correctedExpression.trim()
            : null;

        setCorrectedFullText(result.correctedText);
        setCorrectedExpression(correctedExpr);
        const changesMade = result.correctedText !== textToCorrect || correctedExpr !== expressionToCorrect;
        toast({
          title: "AI Correction Applied",
          description: changesMade ? "AI has updated the text/expression." : "AI reviewed, no changes suggested.",
          icon: changesMade ? <BrainCircuit className="h-5 w-5 text-primary" /> : <Info className="h-5 w-5 text-blue-500" />,
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
  }, [correctedFullText, correctedExpression, ocrFullText, toast]); // Ensure ocrFullText is dependency for bypass check

  const handleSolve = useCallback(async () => {
    const context = correctedFullText?.trim();
    const expression = correctedExpression?.trim() || null;

    // Check if the *original* OCR result was an error that should bypass solving
    if (BYPASS_ALL_PROCESSING_MESSAGES.includes(ocrFullText)) {
       const userMessage = `Cannot solve because the initial text extraction failed (${ocrFullText}). Please upload a clearer image or correct the text manually.`;
       setSolution(`${MATH_AI_ERROR_PREFIX} ${userMessage}`);
       toast({ title: "Cannot Solve", description: userMessage, variant: "destructive" });
       return; // Stop if initial OCR failed critically
    }

    // Check if there's actually text to solve after potential edits
    if (!context || context.trim() === '') {
       const userMessage = `Cannot solve because the text context is empty. Please upload an image or enter text.`;
       setSolution(`${MATH_AI_ERROR_PREFIX} ${userMessage}`);
       toast({ title: "Invalid Input for Solver", description: userMessage, variant: "destructive" });
       return; // Stop if no text
    }


    setIsLoadingSolution(true);
    setError(null);
    setSolution('');
    console.log("Calling solveMathExpression flow...");
    const cleanupProgress = simulateProgress(3500); // Simulate 3.5-second solving

    try {
       // Optional: Implicitly run correction if not done manually?
      // Or rely on user to click 'Correct' or just edit. Let's rely on user edits for now.

      const result = await solveMathExpression({ fullTextContext: context, expression: expression });
      console.log("Solver Result (Markdown):", result);

      if (!result || typeof result.solution !== 'string') {
        console.error("Received invalid or null response from solver service.");
        const solutionErrorMsg = `${MATH_AI_ERROR_PREFIX} Solver error (invalid response).`;
        setError("Solver Error: Invalid response from service."); // Keep generic error state
        setSolution(solutionErrorMsg);
        toast({ title: "Solving Error", description: "Invalid response from solver service.", variant: "destructive" });
      } else {
        setSolution(result.solution);
        const isErrorSolution = result.solution.startsWith(MATH_AI_ERROR_PREFIX);
        const isConclusion = result.solution.startsWith(MATH_AI_CONCLUSION_PREFIX);
        toast({
          title: isErrorSolution ? "Solver Issue" : isConclusion ? "Solver Conclusion" : "Solution Generated",
          description: isErrorSolution ? "The solver reported an issue." : isConclusion ? "The solver reached a conclusion." : "Successfully generated step-by-step solution.",
          variant: isErrorSolution ? "destructive" : "default",
          icon: isErrorSolution ? <AlertCircle className="h-5 w-5 text-red-400" /> : <CheckCircle className="h-5 w-5 text-green-500" />,
        });
      }
    } catch (err) {
      console.error("Error during solving process:", err);
      const errorMsg = err instanceof Error ? err.message : "Unknown error.";
      const displayError = `Solver Process Error: Failed to communicate with AI (${errorMsg}).`;
      const solutionErrorMsg = `${MATH_AI_ERROR_PREFIX} Unexpected error: Failed to reach AI solving service.`;
      setError(displayError);
      setSolution(solutionErrorMsg);
      toast({ title: "Solving Call Failed", description: "Could not reach solving service.", variant: "destructive" });
    } finally {
      cleanupProgress(); // Clear interval and finalize progress
      setIsLoadingSolution(false);
      console.log("Finished solving attempt.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correctedFullText, correctedExpression, ocrFullText, toast]); // Add ocrFullText dependency for bypass check

  // --- Event Handlers ---

  const handleImageUpload = useCallback((uploadedFile: File) => {
    console.log("Starting image upload process...");
    setFile(uploadedFile);

    const tempImageUrl = URL.createObjectURL(uploadedFile);
    setImageUrl(tempImageUrl); // Show preview immediately

    // Clear previous results thoroughly
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
      // Ensure it becomes null if the input is cleared, not just an empty string
      setCorrectedExpression(value.trim() === '' ? null : value);
    }
    // Clear downstream solution/error on user edit
    if (solution) setSolution('');
    // Clear only specific errors (like solving errors) when user edits, keep OCR errors
    if (error && (error.toLowerCase().includes('solver') || error.toLowerCase().includes('solving'))) {
        setError(null);
    }
  };

  const performClearAll = () => {
    // Revoke object URLs if they exist
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
    toast({ title: "Cleared", description: "All fields reset.", icon: <Eraser className="h-5 w-5 text-muted-foreground" /> });
  };


  // --- Derived State for UI ---

  const rawOcrDisplayFullText = isLoadingOcr ? "Extracting text..." :
                           ocrFullText === NO_TEXT_FOUND_MESSAGE ? "No readable text found." :
                           BYPASS_ALL_PROCESSING_MESSAGES.includes(ocrFullText) ? `OCR Error: ${ocrFullText}` :
                           ocrFullText ? ocrFullText : "Upload or capture an image to start.";

  const rawOcrDisplayExpression = isLoadingOcr ? "Extracting..." :
                                  !ocrFullText || BYPASS_ALL_PROCESSING_MESSAGES.includes(ocrFullText) ? "N/A" :
                                  ocrExpression ? ocrExpression : "(No distinct expression found)";

  // Placeholder logic needs to consider the OCR state
  const getPlaceholder = (type: 'text' | 'expression'): string => {
      if (isLoadingCorrection) return "AI correcting...";
      if (isLoadingOcr) return "Waiting for OCR..."; // Added state for when OCR is running

      if (!ocrFullText) return "Upload or capture image first.";
      if (BYPASS_ALL_PROCESSING_MESSAGES.includes(ocrFullText)) return "Cannot edit due to OCR error.";
      if (ocrFullText === NO_TEXT_FOUND_MESSAGE) {
          return type === 'text' ? "No text found to edit." : "No expression found.";
      }

      // If we have valid OCR text
      return type === 'text' ? "Edit full text if needed..." : "Edit expression if needed, or leave blank if none...";
  };

  const correctedTextPlaceholder = getPlaceholder('text');
  const correctedExpressionPlaceholder = getPlaceholder('expression');

  // Enable correction/solving only if we have non-error OCR text
  const hasValidOcrText = ocrFullText && !BYPASS_ALL_PROCESSING_MESSAGES.includes(ocrFullText) && ocrFullText !== NO_TEXT_FOUND_MESSAGE;
  // Enable solving only if the *editable* text is not empty
  const canSolve = correctedFullText && correctedFullText.trim() !== '' && hasValidOcrText;
  // Enable correction if we have valid OCR text (even if editable fields are empty initially)
  const canCorrect = hasValidOcrText;

  const confidenceDetails = getConfidenceDetails(ocrConfidence);

  // --- JSX ---
  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">

      {error && (
        <Alert variant="destructive" className="mb-6 shadow-lg rounded-xl border-destructive/60 bg-destructive/10">
          <AlertCircle className="h-5 w-5 text-destructive" /> {/* Ensure icon color matches variant */}
          <AlertTitle className="font-semibold text-base">Error Encountered</AlertTitle>
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      {(isProcessing) && (
         <Progress value={progress} className="w-full h-1 mb-6 rounded-full bg-primary/20 [&>*]:bg-primary transition-all duration-150" />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">

        {/* --- Left Panel: Upload & Preview --- */}
        <Card className="shadow-xl rounded-2xl border border-border/50 bg-card flex flex-col h-full overflow-hidden transition-shadow hover:shadow-2xl">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2 text-foreground">
              <ImageIcon className="w-5 h-5 text-primary" />
              1. Upload or Capture
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">Use a clear image of your math problem.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col flex-grow p-4 md:p-6 items-center justify-center">
            <ImageUploader
              onImageUpload={handleImageUpload}
              imageUrl={imageUrl}
              setImageUrl={setImageUrl}
              setFile={setFile}
              className="flex-grow w-full mb-4 min-h-[250px] md:min-h-[300px] transition-all duration-300 ease-in-out rounded-xl" // Adjusted height
            />
             {/* Loading indicator inside the uploader area (optional) */}
             {isLoadingOcr && progress < 100 && (
              <div className="mt-auto flex items-center justify-center text-muted-foreground p-2 text-sm w-full">
                <LoadingSpinner size={16} className="mr-2 text-primary" />
                <span>Processing Image ({Math.round(progress)}%)...</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* --- Middle Panel: Verify & Edit --- */}
        <Card className="shadow-xl rounded-2xl border border-border/50 bg-card flex flex-col h-full relative overflow-hidden transition-shadow hover:shadow-2xl">
          {(isLoadingCorrection) && ( // Overlay for correction
             <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-20 rounded-2xl p-4 text-center backdrop-blur-sm">
               <LoadingSpinner className="text-primary h-6 w-6" />
               <span className="mt-2 text-muted-foreground text-sm">
                 AI Correcting...
               </span>
             </div>
          )}
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-lg font-semibold text-foreground">2. Verify & Edit Text</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">Review extracted text. Edit if needed before solving.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col flex-grow p-4 md:p-6 space-y-4">
             {/* ScrollArea now wraps the entire editable section */}
            <ScrollArea className="flex-grow -mx-4 px-4 h-0 min-h-[300px]"> {/* Ensure ScrollArea takes available space */}
              <div className="space-y-4">
                 {/* Raw OCR Full Text Output */}
                 <div className="relative group">
                     <label htmlFor="ocrFullText" className="text-xs font-medium text-muted-foreground block mb-1">Raw OCR - Full Text</label>
                     <Textarea
                        id="ocrFullText"
                        value={rawOcrDisplayFullText}
                        readOnly
                        placeholder="Raw text appears here..."
                        className="min-h-[60px] bg-muted/30 border-border/50 text-muted-foreground resize-none text-sm rounded-lg shadow-inner"
                        aria-label="Raw OCR Full Text Output (Readonly)"
                     />
                     {/* Confidence Score Display */}
                     {confidenceDetails.level && !isLoadingOcr && (
                       <div title={confidenceDetails.text} className="absolute bottom-1.5 right-2 text-xs text-muted-foreground bg-background/70 px-1.5 py-0.5 rounded-md flex items-center gap-1 cursor-help">
                         {confidenceDetails.icon}
                         <span>{(ocrConfidence! * 100).toFixed(0)}%</span>
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
                        placeholder="Isolated expression..."
                        className="bg-muted/30 border-border/50 text-muted-foreground text-sm rounded-lg shadow-inner"
                        aria-label="Raw OCR Isolated Expression (Readonly)"
                     />
                 </div>

                  {/* Preprocessed Image Preview */}
                  <div className="pt-2">
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Preprocessed Image Preview (used for OCR)</label>
                      <div className="border border-border/50 rounded-lg p-2 bg-muted/20 min-h-[80px] flex items-center justify-center shadow-inner">
                          {preprocessedImageUrl ? (
                              <Image
                                  src={preprocessedImageUrl}
                                  alt="Preprocessed Math Problem"
                                  width={250}
                                  height={125}
                                  className="max-h-[100px] w-auto object-contain rounded-sm"
                                  data-ai-hint="preprocessed math text"
                                  // Use key to force re-render if URI changes
                                  key={preprocessedImageUrl}
                              />
                          ) : (
                              <span className="text-xs text-muted-foreground text-center px-4">
                                  {isLoadingOcr ? 'Generating preview...' : imageUrl ? 'Preview appears after processing.' : 'Upload or capture first.'}
                              </span>
                          )}
                      </div>
                  </div>

                 {/* Corrected/Editable Full Text */}
                 <div className="relative group pt-2">
                     <label htmlFor="correctedFullText" className="text-xs font-medium text-foreground block mb-1">Parsed Text (Editable)</label>
                     <Textarea
                        id="correctedFullText"
                        name="correctedFullText"
                        value={correctedFullText}
                        onChange={handleTextChange}
                        placeholder={correctedTextPlaceholder}
                        className="min-h-[100px] focus:ring-primary focus:border-primary resize-y text-sm rounded-lg shadow-sm transition-shadow focus:shadow-md"
                        aria-label="Parsed Full Text (Editable)"
                        disabled={isProcessing || !hasValidOcrText} // Disable if processing or OCR failed/no text
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
                        className="focus:ring-primary focus:border-primary text-sm rounded-lg shadow-sm transition-shadow focus:shadow-md"
                        aria-label="Parsed Expression (Editable)"
                         disabled={isProcessing || !hasValidOcrText} // Disable if processing or OCR failed/no text
                     />
                 </div>
              </div>
            </ScrollArea>

             {/* Buttons section pushed to the bottom */}
            <div className="mt-auto pt-4 space-y-3 border-t border-border/50">
                 <Button
                    variant="ghost" // Subtle ghost button for AI correction
                    size="sm"
                    onClick={handleAiCorrection}
                    disabled={!canCorrect || isProcessing} // Disable based on valid OCR text
                    className="w-full text-xs text-primary hover:bg-primary/10 hover:text-primary rounded-lg"
                    aria-label="Attempt to automatically correct OCR errors using AI"
                 >
                    {isLoadingCorrection ? <LoadingSpinner size={14} className="mr-1" /> : <BrainCircuit className="mr-1 h-3.5 w-3.5" />}
                    Correct with AI
                 </Button>
                 <Button
                    onClick={handleSolve}
                    disabled={!canSolve || isProcessing} // Disable based on editable text & valid OCR
                    className="w-full font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow-sm hover:shadow-md transition-all"
                    aria-label="Solve the problem based on the parsed text"
                >
                    {isLoadingSolution ? <LoadingSpinner className="mr-2" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                    Solve Problem
                </Button>
            </div>
          </CardContent>
        </Card>

        {/* --- Right Panel: Solution --- */}
        <Card className="shadow-xl rounded-2xl border border-border/50 bg-card flex flex-col h-full relative overflow-hidden transition-shadow hover:shadow-2xl">
           {isLoadingSolution && progress < 100 && ( // Overlay only for solution loading
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
             {/* ScrollArea wraps the solution display */}
            <ScrollArea className="flex-grow border border-border/40 bg-muted/20 p-4 rounded-xl mb-4 min-h-[300px] shadow-inner h-0">
                <div className="prose prose-sm max-w-none text-foreground dark:prose-invert prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1 prose-li:my-0.5 prose-strong:text-primary prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded-md prose-code:font-normal">
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
                            !imageUrl ? 'Upload or capture an image first.' :
                            !hasValidOcrText && !isLoadingOcr ? 'OCR failed. Cannot solve.' : // Specific message for OCR failure
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
                    className="w-full mt-auto font-medium border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/50 rounded-lg"
                    disabled={isProcessing}
                    aria-label="Clear all fields and the uploaded image"
                 >
                    <Eraser className="mr-2 h-4 w-4" />
                    Clear All
                 </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-xl">
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

