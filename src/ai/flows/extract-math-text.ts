
'use server';

/**
 * @fileOverview A Genkit flow to extract text from an image, optimized for math expressions and word problems.
 *
 * - extractMathText - A function that takes an image data URI and returns the extracted full text and any isolated mathematical expression.
 * - ExtractMathTextInput - The input type for the extractMathText function.
 * - ExtractMathTextOutput - The return type for the extractMathText function.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';
import { CandidateData } from 'genkit/ai'; // Import CandidateData for safety check
import { preprocessImageForOcr } from '@/ai/flows/image-preprocessing'; // Import the preprocessing function


// Define reusable schemas
const ImageDataUriSchema = z
    .string()
    .describe(
      "An image containing text, potentially a mathematical expression or a word problem, as a data URI. Format: 'data:<mimetype>;base64,<encoded_data>'."
    );

const ExtractMathTextInputSchema = z.object({
  imageDataUri: ImageDataUriSchema,
});
export type ExtractMathTextInput = z.infer<typeof ExtractMathTextInputSchema>;


const ExtractedExpressionSchema = z
    .string()
    .optional()
    .describe('Any isolated mathematical expression clearly identifiable within the image (e.g., "2x + 3 = 7"). Use standard notation (superscripts, √). If no distinct expression is found separate from the main text, this should be null or empty.');

const FullTextSchema = z
    .string()
    .describe('The full text extracted from the image, including all words and numbers, preserving paragraphs and line breaks where meaningful. If NO text is found, respond with the exact string "NO_TEXT_FOUND".');

// Include preprocessed image in output
const ExtractMathTextOutputSchema = z.object({
  extractedExpression: ExtractedExpressionSchema,
  fullText: FullTextSchema,
  preprocessedImageUri: z.string().optional().describe("Data URI of the preprocessed image used for OCR, if available."),
});
export type ExtractMathTextOutput = z.infer<typeof ExtractMathTextOutputSchema>;


// --- Constants ---
const NO_TEXT_FOUND_MARKER = "NO_TEXT_FOUND";
const OCR_PROCESSING_ERROR_MARKER = "OCR_PROCESSING_ERROR";
const OCR_BLOCKED_BY_SAFETY_MARKER = "OCR_BLOCKED_BY_SAFETY";
const PREPROCESSING_ERROR_MARKER = "PREPROCESSING_ERROR";
const API_ERROR_INVALID_KEY_MARKER = "API_ERROR_INVALID_KEY";
const API_ERROR_QUOTA_MARKER = "API_ERROR_QUOTA";
const GENERAL_API_ERROR_MARKER = "API_GENERAL_ERROR";

// --- Exported Function ---
/**
 * Takes an image data URI, preprocesses it, extracts full text and optionally a distinct math expression.
 * @param input - Object containing the image data URI.
 * @returns Object containing the full text, optional extracted expression, preprocessed image URI, or an error marker in fullText.
 */
export async function extractMathText(input: ExtractMathTextInput): Promise<ExtractMathTextOutput> {
  // Basic data URI validation
  if (!input.imageDataUri || !input.imageDataUri.startsWith('data:image/')) {
      console.error("Invalid imageDataUri format provided to extractMathText:", input.imageDataUri?.substring(0, 50) + "...");
      return { fullText: OCR_PROCESSING_ERROR_MARKER, preprocessedImageUri: input.imageDataUri, extractedExpression: null }; // Return original URI on format error
  }

  // --- Image Preprocessing ---
  let preprocessedImageDataUri: string | undefined = input.imageDataUri; // Default to original
  try {
    console.log("Starting image preprocessing...");
    preprocessedImageDataUri = await preprocessImageForOcr(input.imageDataUri);
    console.log("Image preprocessing successful (or bypassed).");
  } catch (error) {
    console.error("Error during image preprocessing:", error);
    return { fullText: PREPROCESSING_ERROR_MARKER, preprocessedImageUri: input.imageDataUri, extractedExpression: null };
  }

  // Use the (potentially) preprocessed URI for the OCR call
  const flowInput = { imageDataUri: preprocessedImageDataUri || input.imageDataUri };

  // Call the Genkit flow
  const flowResult = await extractMathTextFlow(flowInput);

  // Return the flow result along with the URI *used* for the OCR attempt
  return {
    ...flowResult, // Contains fullText and extractedExpression (or errors in fullText)
    preprocessedImageUri: flowInput.imageDataUri,
  };
}


// --- Genkit Prompt Definition ---
const prompt = ai.definePrompt({
  name: 'extractMathTextPrompt',
  input: {
    schema: z.object({ imageDataUri: ImageDataUriSchema }),
  },
  output: {
    // Output schema includes both full text and optional expression
    schema: z.object({
        fullText: FullTextSchema,
        extractedExpression: ExtractedExpressionSchema
    }),
  },
  model: 'googleai/gemini-1.5-flash', // Use 1.5 Flash for vision capabilities
  prompt: `TASK: Analyze the provided image meticulously. Extract ALL readable text content, preserving structure like paragraphs and line breaks. Additionally, identify and separately extract any distinct, primary mathematical expression if one exists.

IMAGE: {{media url=imageDataUri}}

CRITICAL INSTRUCTIONS:

1.  **EXTRACT ALL TEXT (Primary Goal):** Transcribe *all* text visible in the image accurately. This includes words, numbers, sentences, questions, labels, etc. Maintain paragraph structure and line breaks as they appear in the image if they seem intentional. This is the text that should go into the 'fullText' output field.
2.  **IDENTIFY DISTINCT MATH EXPRESSION (Secondary Goal):** Look for a clearly defined mathematical equation or expression (e.g., \`2x + 3 = 11\`, \`∫(x²)dx\`, \`Area = πr²\`).
    *   If a distinct mathematical expression is found, extract it precisely using standard notation (see below) and place it in the 'extractedExpression' output field.
    *   If the math is embedded within a sentence (e.g., "Find the value of x if 2x+3=11."), extract only the "2x+3=11" part for 'extractedExpression'. The full sentence goes into 'fullText'.
    *   If there is NO distinct mathematical expression, or if the math is just simple numbers within the text, the 'extractedExpression' output field should be null or empty.
3.  **HANDWRITING INTERPRETATION:** Apply common sense for handwritten text, prioritizing context.
    *   'l' likely '1', 'O' likely '0', 'S' likely '5', 'B' likely '8', 'Z' likely '2', 'g'/'q' likely '9', 't' likely '+'.
    *   Interpret 'x' as variable unless clearly multiplication ('×').
4.  **MATH NOTATION (for extractedExpression *only*):**
    *   Use standard characters: +, -, × (not *), ÷ (not /), =.
    *   Exponents: Use superscript characters (e.g., \`x²\`, \`y³\`) ONLY for single digit/variable exponents. Otherwise, use '^' with parentheses: \`(base)^(exponent)\` (e.g., \`(x+y)²\`, \`e^(2x)\`).
    *   Square Roots: ALWAYS use the symbol \`√\` followed by parentheses for multi-term radicands: \`√(expression)\` (e.g., \`√(x²+1)\`). For single terms, \`√x\` or \`√16\` is fine.
    *   Fractions: Use 'numerator/denominator'. Parenthesize if complex: \`(a+b)/(c-d)\`.
    *   Greek Letters: Use standard names (pi, alpha) or symbols (π, α).
    *   Standard functions: sin, cos, tan, log, ln, lim, sum, int.
5.  **STRICT OUTPUT FORMAT:** Respond with a JSON object containing two keys: 'fullText' and 'extractedExpression'.
    *   \`fullText\`: Contains *all* transcribed text. If NO text is readable, this field MUST be the exact string "NO_TEXT_FOUND".
    *   \`extractedExpression\`: Contains the distinct mathematical expression (using notation above), or null/empty string if none is found.
    *   DO NOT add any explanations, greetings, or markdown formatting outside the JSON structure.

JSON Output:`,
});

// --- Genkit Flow Definition ---
const extractMathTextFlow = ai.defineFlow<
  typeof ExtractMathTextInputSchema,
  typeof ExtractMathTextOutputSchema // Flow output now matches the full schema
>({
  name: 'extractMathTextFlow',
  inputSchema: ExtractMathTextInputSchema,
  outputSchema: ExtractMathTextOutputSchema, // Use the updated output schema
}, async (input) => {
 try {
    console.log("Calling Gemini 1.5 Flash Vision for text/math extraction...");
    const response = await prompt(input); // Prompt now outputs { fullText, extractedExpression }

    console.log("Raw Vision API Response (excluding large data):", JSON.stringify({ ...response, input: { imageDataUri: '...' } }, null, 2));

    // --- Safety Checks and Output Processing ---
    if (!response || !response.output) {
        console.error("OCR flow received null or empty response structure from the model. Returning OCR_PROCESSING_ERROR.");
        return { fullText: OCR_PROCESSING_ERROR_MARKER, extractedExpression: null };
    }

    const candidate = response as CandidateData;
    if (candidate?.finishReason && candidate.finishReason === 'SAFETY') {
        console.error("Model response was blocked due to safety settings.");
        return { fullText: OCR_BLOCKED_BY_SAFETY_MARKER, extractedExpression: null };
    }
     if (candidate?.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MODEL') {
         console.warn(`Model response finished with unusual reason: ${candidate.finishReason}`);
     }

    // Check if output has the expected structure
    if (!('fullText' in response.output)) { // extractedExpression is optional, so only check fullText
        console.error("OCR flow received unexpected output structure:", response.output);
        return { fullText: OCR_PROCESSING_ERROR_MARKER, extractedExpression: null };
    }

    const fullTextResult = response.output.fullText;
    const expressionResult = response.output.extractedExpression; // Might be null/undefined/empty

    // Handle null/undefined fullText explicitly -> NO_TEXT_FOUND
    if (fullTextResult === null || fullTextResult === undefined) {
        console.warn("Model returned null or undefined for fullText. Interpreting as NO_TEXT_FOUND.");
        return { fullText: NO_TEXT_FOUND_MARKER, extractedExpression: null };
    }

    // Trim whitespace from fullText
    const trimmedFullText = fullTextResult.trim();
    const trimmedExpression = expressionResult?.trim() || null; // Trim if exists, else null

    console.log("Trimmed full text:", trimmedFullText);
    console.log("Trimmed extracted expression:", trimmedExpression);

    // Check for explicit "NO_TEXT_FOUND" marker or empty string after trim in fullText
    if (trimmedFullText === "" || trimmedFullText.toUpperCase() === NO_TEXT_FOUND_MARKER) {
      console.log(`Model returned empty string or explicit ${NO_TEXT_FOUND_MARKER} for fullText. Final result: ${NO_TEXT_FOUND_MARKER}`);
      return { fullText: NO_TEXT_FOUND_MARKER, extractedExpression: null }; // No text means no expression either
    }

    // Return the valid results
    console.log("Returning valid extracted text and expression.");
    return {
        fullText: trimmedFullText,
        extractedExpression: trimmedExpression
    };

  } catch (error: unknown) {
      console.error("Error executing extractMathTextFlow:", error);
       const errorMsg = error instanceof Error ? error.message : String(error);
       console.error("Underlying error:", errorMsg);

       if (errorMsg.includes('API key not valid') || errorMsg.includes('permission denied')) {
           console.error("API Key or Permission Error detected.");
           return { fullText: API_ERROR_INVALID_KEY_MARKER, extractedExpression: null };
       }
       if (errorMsg.includes('quota') || errorMsg.includes('Quota')) {
           console.error("Quota Exceeded Error detected.");
           return { fullText: API_ERROR_QUOTA_MARKER, extractedExpression: null };
       }

       return { fullText: GENERAL_API_ERROR_MARKER, extractedExpression: null };
  }
});
