'use server';

/**
 * @fileOverview A Genkit flow to extract text from an image, optimized for math expressions, including handwritten ones.
 *
 * - extractMathText - A function that takes an image data URI and returns the extracted text.
 * - ExtractMathTextInput - The input type for the extractMathText function.
 * - ExtractMathTextOutput - The return type for the extractMathText function.
 * - PreprocessedImageOutput - The return type including the preprocessed image URI.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';
import { CandidateData } from 'genkit/ai'; // Import CandidateData for safety check
import { preprocessImageForOcr } from './image-preprocessing'; // Corrected import path


// Define reusable schemas
const ImageDataUriSchema = z
    .string()
    .describe(
      "An image containing a math expression (printed or handwritten), as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    );

const ExtractMathTextInputSchema = z.object({
  imageDataUri: ImageDataUriSchema,
});
export type ExtractMathTextInput = z.infer<typeof ExtractMathTextInputSchema>;


const ExtractedTextSchema = z
    .string()
    .describe('The mathematical text extracted from the image, focusing only on the expression itself. If NO clear mathematical expression is found, respond with the exact string "NO_TEXT_FOUND". Do not include explanations or formatting.');

// Include preprocessed image in output
const ExtractMathTextOutputSchema = z.object({
  extractedText: ExtractedTextSchema,
  preprocessedImageUri: z.string().optional().describe("Data URI of the preprocessed image used for OCR, if available."),
});
export type ExtractMathTextOutput = z.infer<typeof ExtractMathTextOutputSchema>;


// --- Constants ---
const NO_TEXT_FOUND_MARKER = "NO_TEXT_FOUND";
const OCR_PROCESSING_ERROR_MARKER = "OCR_PROCESSING_ERROR";
const OCR_BLOCKED_BY_SAFETY_MARKER = "OCR_BLOCKED_BY_SAFETY";
const PREPROCESSING_ERROR_MARKER = "PREPROCESSING_ERROR";

// --- Exported Function ---
/**
 * Takes an image data URI, preprocesses it, extracts mathematical text using a Genkit flow.
 * @param input - Object containing the image data URI.
 * @returns Object containing the extracted text, preprocessed image URI, or an error marker.
 */
export async function extractMathText(input: ExtractMathTextInput): Promise<ExtractMathTextOutput> {
  // Basic data URI validation
  if (!input.imageDataUri || !input.imageDataUri.startsWith('data:image/')) {
      console.error("Invalid imageDataUri format provided to extractMathText:", input.imageDataUri?.substring(0, 50) + "...");
      return { extractedText: OCR_PROCESSING_ERROR_MARKER };
  }

  // --- Image Preprocessing ---
  let preprocessedImageDataUri: string | undefined;
  try {
    console.log("Starting image preprocessing...");
    preprocessedImageDataUri = await preprocessImageForOcr(input.imageDataUri);
    console.log("Image preprocessing successful (or skipped by placeholder).");
  } catch (error) {
    console.error("Error during image preprocessing:", error);
    // Decide if we should proceed with the original image or fail
    // For now, let's try proceeding with the original image but log the error
    // return { extractedText: PREPROCESSING_ERROR_MARKER }; // Option to fail hard
    preprocessedImageDataUri = input.imageDataUri; // Fallback to original
    console.warn("Preprocessing failed, falling back to original image for OCR.");
  }

  if (!preprocessedImageDataUri) {
      console.error("Preprocessed image data URI is missing after processing/fallback.");
      return { extractedText: OCR_PROCESSING_ERROR_MARKER };
  }

  // Call the Genkit flow with the potentially preprocessed image
  const flowResult = await extractMathTextFlow({ imageDataUri: preprocessedImageDataUri });

  // Return the flow result along with the preprocessed image URI
  return {
    ...flowResult,
    // Only include preprocessed URI if it's actually different (not just the placeholder fallback)
    preprocessedImageUri: preprocessedImageDataUri !== input.imageDataUri ? preprocessedImageDataUri : undefined,
  };
}


// --- Genkit Prompt Definition ---
const prompt = ai.definePrompt({
  name: 'extractMathTextPrompt',
  input: {
    // Input is just the image data URI (potentially preprocessed)
    schema: z.object({ imageDataUri: ImageDataUriSchema }),
  },
  output: {
    // Output is just the extracted text object
    schema: z.object({ extractedText: ExtractedTextSchema }),
  },
  model: 'googleai/gemini-1.5-flash', // Use 1.5 Flash as it's good with vision and faster/cheaper than Pro
  // Simplified prompt to avoid complex formatting issues in the template string
  prompt: `TASK: Analyze the provided image. Extract only the primary mathematical expression(s). Ignore all non-mathematical content. Be precise.

IMAGE: {{media url=imageDataUri}}

SPECIFIC RULES:
1. Focus ONLY on math: numbers, variables, operators (+, -, *, /, ^, sqrt, sin, cos, log, etc.), brackets, fractions.
2. IGNORE ALL non-math text, labels, noise, backgrounds.
3. Interpret handwriting contextually (e.g., 'l' as '1', 'O' as '0', 'S' as '5', 't' as '+'). Use '*' for multiplication if needed, prefer implicit (2x).
4. Preserve structure: Use '/' for fractions, '^' for exponents, '_' for subscripts, 'sqrt()' for square roots.
5. Output Format:
   - Success: Return ONLY the extracted math expression as plain text. Example: 2x + 3y = 7
   - Failure (No Math Found/Unclear): Return the exact string: NO_TEXT_FOUND
   - DO NOT add explanations or markdown.

Extracted Mathematical Text:`,
});

// --- Genkit Flow Definition ---
// Input is the same (image URI), Output is simplified to just { extractedText: string }
const extractMathTextFlow = ai.defineFlow<
  typeof ExtractMathTextInputSchema, // Input schema remains the same
  z.ZodObject<{ extractedText: typeof ExtractedTextSchema }> // Output schema for the *flow*
>({
  name: 'extractMathTextFlow',
  inputSchema: ExtractMathTextInputSchema,
  outputSchema: z.object({ extractedText: ExtractedTextSchema }), // Simplified flow output schema
}, async (input) => { // Input now contains the potentially preprocessed imageDataUri
 try {
    console.log("Calling Gemini 1.5 Flash Vision for math text extraction...");

    // Make the API call using the prompt
    // The prompt itself expects { imageDataUri: string } and outputs { extractedText: string }
    const response = await prompt(input);

    // Log the raw response for debugging
    console.log("Raw Vision API Response:", JSON.stringify(response, null, 2));

    // --- Safety Checks and Output Processing ---

    // Check for basic output presence from the prompt call
    if (!response || !response.output) {
        console.error("OCR flow received null or empty response structure from the model. Returning OCR_PROCESSING_ERROR.");
        return { extractedText: OCR_PROCESSING_ERROR_MARKER };
    }

     // Check if the response was blocked due to safety settings
    const candidate = response as CandidateData; // Type assertion for inspection
    if (candidate?.finishReason && candidate.finishReason === 'SAFETY') {
        console.error("Model response was blocked due to safety settings.");
        return { extractedText: OCR_BLOCKED_BY_SAFETY_MARKER };
    }
    if (candidate?.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MODEL') {
         // Log other non-standard finish reasons
         console.warn(`Model response finished with unusual reason: ${candidate.finishReason}`);
    }


    // Check if output is structured as expected { extractedText: string }
    if (!('extractedText' in response.output)) {
        console.error("OCR flow received unexpected output structure:", response.output);
        return { extractedText: OCR_PROCESSING_ERROR_MARKER }; // Generic error if structure is wrong
    }

    // Now safely access extractedText
    const extracted = response.output.extractedText;

    // Handle null/undefined extractedText explicitly
    if (extracted === null || extracted === undefined) {
        console.warn("Model returned null or undefined for extractedText. Interpreting as NO_TEXT_FOUND.");
        return { extractedText: NO_TEXT_FOUND_MARKER };
    }

    // Trim whitespace
    const trimmedText = extracted.trim();
    console.log("Trimmed extracted text:", trimmedText);

    // Check for explicit "NO_TEXT_FOUND" marker or empty string after trim
    if (trimmedText === "" || trimmedText.toUpperCase() === NO_TEXT_FOUND_MARKER) {
      console.log(`Model returned empty string or explicit ${NO_TEXT_FOUND_MARKER}. Final result: ${NO_TEXT_FOUND_MARKER}`);
      return { extractedText: NO_TEXT_FOUND_MARKER };
    }

    // Basic Heuristic Check: Ensure it contains *some* math-related characters.
    // This is a weak check; the prompt is the primary guard.
    const hasMathChars = /[0-9xXyYzZaAbBcCnN+\-*/^=()\[\]{}<>_.,|√∑∫∂∞≈≠≤≥∈∉∀∃∴∵]|sin|cos|tan|log|ln|sqrt|lim|sum|int/i.test(trimmedText);

    if (!hasMathChars) {
        console.warn(`Extracted text "${trimmedText}" seems to lack common math characters. Treating as ${NO_TEXT_FOUND_MARKER}.`);
        return { extractedText: NO_TEXT_FOUND_MARKER };
    }


    // Return the potentially valid, trimmed result
    console.log("Returning valid extracted text:", trimmedText);
    return { extractedText: trimmedText };

  } catch (error: unknown) { // Catch unknown type
      console.error("Error executing extractMathTextFlow:", error);
       const errorMsg = error instanceof Error ? error.message : String(error);
       console.error("Underlying error:", errorMsg);

       // Check if the error is related to API key or permissions
       if (errorMsg.includes('API key not valid') || errorMsg.includes('permission denied')) {
           console.error("API Key or Permission Error detected.");
           return { extractedText: "API_ERROR_INVALID_KEY" }; // Specific marker
       }
        if (errorMsg.includes('quota') || errorMsg.includes('Quota')) {
           console.error("Quota Exceeded Error detected.");
           return { extractedText: "API_ERROR_QUOTA" }; // Specific marker
       }

       return { extractedText: OCR_PROCESSING_ERROR_MARKER };
  }
});
