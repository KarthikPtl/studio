
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
import { preprocessImageForOcr } from '@/ai/flows/image-preprocessing'; // Import the preprocessing function


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
    .describe('The mathematical text extracted from the image, focusing only on the expression itself. Uses standard notation like superscripts (x², y³) and the square root symbol (√). If NO clear mathematical expression is found, respond with the exact string "NO_TEXT_FOUND". Do not include explanations or formatting.');

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
const API_ERROR_INVALID_KEY_MARKER = "API_ERROR_INVALID_KEY";
const API_ERROR_QUOTA_MARKER = "API_ERROR_QUOTA";
const GENERAL_API_ERROR_MARKER = "API_GENERAL_ERROR"; // Added general API error

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
      return { extractedText: OCR_PROCESSING_ERROR_MARKER, preprocessedImageUri: input.imageDataUri }; // Return original URI on format error
  }

  // --- Image Preprocessing ---
  let preprocessedImageDataUri: string | undefined = input.imageDataUri; // Default to original
  try {
    console.log("Starting image preprocessing...");
    // Only preprocess if it's not already a known error state (though unlikely at this point)
    // Preprocessing might throw errors
    preprocessedImageDataUri = await preprocessImageForOcr(input.imageDataUri);
    console.log("Image preprocessing successful (or bypassed).");
  } catch (error) {
    console.error("Error during image preprocessing:", error);
    // If preprocessing fails critically, return error BUT still pass the *original* URI
    return { extractedText: PREPROCESSING_ERROR_MARKER, preprocessedImageUri: input.imageDataUri };
  }

  // Use the (potentially) preprocessed URI for the OCR call
  const flowInput = { imageDataUri: preprocessedImageDataUri || input.imageDataUri };

  // Call the Genkit flow
  const flowResult = await extractMathTextFlow(flowInput);

  // Return the flow result along with the URI *used* for the OCR attempt
  return {
    ...flowResult,
    preprocessedImageUri: flowInput.imageDataUri,
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
  prompt: `TASK: Analyze the provided image meticulously. Your *only* goal is to identify and extract the primary mathematical expression(s) present, whether printed or handwritten. Be extremely precise and robust against noise and variations.

IMAGE: {{media url=imageDataUri}}

CRITICAL INSTRUCTIONS:

1.  **EXTREME FOCUS ON MATH:** Extract *only* mathematical content: numbers, variables (x, y, z, a, b, c, n, etc.), standard function names (sin, cos, tan, log, ln, lim, sum, int), operators (+, -, ×, ÷, ^, √, ∑, ∫, ∂, ∞, ≈, ≠, ≤, ≥, ∈, ∉, ∀, ∃, ∴, ∵), equals signs (=), parentheses/brackets (), fraction bars, decimal points, commas (only if clearly part of numbers like 1,000).
2.  **AGGRESSIVELY IGNORE NON-MATH:** Completely disregard *all* surrounding elements: question numbers (like "1.", "Q2:"), instructions ("Solve for x:", "Simplify:"), descriptive text, labels, names, dates, background noise, paper lines/grids, shadows, fingers, page edges, watermarks, or any other visual clutter. If multiple unrelated items are present, isolate *only* the math expression.
3.  **HANDWRITING INTERPRETATION (Mathematical Context is KEY):**
    *   Interpret ambiguous characters based on *mathematical likelihood*:
        *   'l' is likely '1'.
        *   'O' is likely '0'.
        *   'S' is likely '5'.
        *   'B' is likely '8'.
        *   'Z' is likely '2'.
        *   'g', 'q' are likely '9'.
        *   't' near numbers/variables is likely '+'.
        *   'x' could be a variable or a multiplication sign ('×'). Use '×' if explicit or clearly between numbers (e.g., 3 × 4). Prefer implicit multiplication for variables (e.g., '2x', 'ab'). If ambiguous, lean towards 'x' as a variable unless context strongly suggests multiplication.
    *   Handle variations: Connect broken character strokes if context implies a single character. Interpret cursive or stylized writing in a mathematical context.
4.  **PRESERVE STRUCTURE (Using Standard Math Notation):**
    *   Maintain the original mathematical structure precisely.
    *   **Fractions:** Use 'numerator/denominator'. Parenthesize numerator/denominator if complex (e.g., '(x+1)/(y-2)').
    *   **Exponents:** Use SUPERSCRIPT characters (e.g., \`x²\`, \`y³\`) whenever possible. If the exponent is complex or not a single digit/variable, use the caret \`^\` and parentheses: \`(base)^(exponent)\` (e.g., \`(x+y)²\`, \`e^(2x)\`).
    *   **Subscripts:** Use '_' for subscripts (e.g., 'x₁').
    *   **Multiplication:** Use '×' (times symbol) for explicit multiplication between numbers. Prefer implicit for coefficient/variable (2x) or variable/variable (xy). Use '×' if needed for clarity (e.g., between parenthesized expressions: '(x+1)×(y-2)'). Avoid '*'.
    *   **Division:** Use '÷' (division symbol) or fraction notation (1/2). Avoid '/'.
    *   **Greek Letters:** Use standard names (e.g., pi, alpha, beta, theta) or Unicode symbols (π, α, β, θ).
    *   **Integrals/Sums:** Use '∫' or '∑' with appropriate limits notation if possible (e.g., '∫[a to b] f(x) dx', '∑[i=1 to n] i').
    *   **Limits:** Use 'lim' notation (e.g., 'lim[x→0] f(x)').
    *   **Square Roots:** ALWAYS use the actual symbol '√' followed by the expression, possibly in parentheses for clarity (e.g., √16, √(x²+1)). DO NOT use 'sqrt()'.
    *   **Order of Operations:** Respect PEMDAS/BODMAS implicitly through structure.
5.  **STRICT OUTPUT FORMAT:**
    *   **Success:** If a clear mathematical expression is extracted, return *only* that expression as a single line of plain text using the standard notation described above. NO explanation, NO commentary, NO greetings, NO markdown (like \`\`\`). Just the math. Example: \`2x + 3y = 7\` or \`x² - 4 = 0\` or \`√(a²+b²)\`.
    *   **Failure (No Math Found):** If the image is blurry, unclear, contains NO discernible mathematical content, or if you CANNOT reliably extract any math expression, return the *exact* string: \`NO_TEXT_FOUND\`
    *   **Failure (Ambiguity):** If multiple potential math expressions exist and it's ambiguous which is primary, return \`NO_TEXT_FOUND\`.
    *   **DO NOT GUESS:** If confidence is very low, return \`NO_TEXT_FOUND\`.

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
    // Avoid logging the entire image data URI in production if possible
    console.log("Raw Vision API Response (excluding large data):", JSON.stringify({ ...response, input: { imageDataUri: '...' } }, null, 2));

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
         // Depending on the reason, might want to return an error or try to process anyway
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
    const hasMathChars = /[0-9xXyYzZaAbBcCnN+\-×÷^=()\[\]{}<>_.,|√∑∫∂∞≈≠≤≥∈∉∀∃∴∵πθε]|sin|cos|tan|log|ln|lim|sum|int/i.test(trimmedText);


    if (!hasMathChars && trimmedText.length < 20) { // Add length check to avoid flagging long non-math text as error
        console.warn(`Extracted text "${trimmedText}" seems short and lacks common math characters. Treating as ${NO_TEXT_FOUND_MARKER}.`);
        return { extractedText: NO_TEXT_FOUND_MARKER };
    }


    // Return the potentially valid, trimmed result
    console.log("Returning valid extracted text:", trimmedText);
    return { extractedText: trimmedText };

  } catch (error: unknown) { // Catch unknown type
      console.error("Error executing extractMathTextFlow:", error);
       const errorMsg = error instanceof Error ? error.message : String(error);
       console.error("Underlying error:", errorMsg);

       // Check for specific API errors
       if (errorMsg.includes('API key not valid') || errorMsg.includes('permission denied')) {
           console.error("API Key or Permission Error detected.");
           return { extractedText: API_ERROR_INVALID_KEY_MARKER };
       }
       if (errorMsg.includes('quota') || errorMsg.includes('Quota')) {
           console.error("Quota Exceeded Error detected.");
           return { extractedText: API_ERROR_QUOTA_MARKER };
       }
       // Add more specific error checks if needed based on observed API responses

       // Fallback to a general API error marker
       return { extractedText: GENERAL_API_ERROR_MARKER };
  }
});
