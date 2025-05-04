'use server';

/**
 * @fileOverview A Genkit flow to extract text from an image, optimized for math expressions, including handwritten ones.
 *
 * - extractMathText - A function that takes an image data URI and returns the extracted text.
 * - ExtractMathTextInput - The input type for the extractMathText function.
 * - ExtractMathTextOutput - The return type for the extractMathText function.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';

const ExtractMathTextInputSchema = z.object({
  imageDataUri: z
    .string()
    .describe(
      "An image containing a math expression (printed or handwritten), as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractMathTextInput = z.infer<typeof ExtractMathTextInputSchema>;

const ExtractMathTextOutputSchema = z.object({
  extractedText: z
    .string()
    .describe('The mathematical text extracted from the image, focusing only on the expression itself, or "NO_TEXT_FOUND" if no clear mathematical expression could be reliably identified.'),
});
export type ExtractMathTextOutput = z.infer<typeof ExtractMathTextOutputSchema>;

export async function extractMathText(input: ExtractMathTextInput): Promise<ExtractMathTextOutput> {
  return extractMathTextFlow(input);
}

const prompt = ai.definePrompt({
  name: 'extractMathTextPrompt',
  input: {
    schema: z.object({
      imageDataUri: z
        .string()
        .describe(
          "An image containing a math expression (printed or handwritten), as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
        ),
    }),
  },
  output: {
    schema: z.object({
      extractedText: z
        .string()
        .describe('The mathematical text extracted from the image, focusing only on the expression itself, or "NO_TEXT_FOUND" if no clear mathematical expression could be reliably identified.'),
    }),
  },
  model: 'googleai/gemini-pro-vision', // Use Vision model
  prompt: `You are an expert Optical Character Recognition (OCR) engine specialized in extracting mathematical expressions from images. Analyze the provided image with extreme care. Your primary goal is to isolate and extract *only* the mathematical expression, whether it's printed or handwritten.

Think of this process like advanced image preprocessing for math:
1.  **Isolate the Expression:** Mentally separate the core mathematical expression from *everything* else in the background or surrounding area. Ignore non-mathematical text (like question numbers, names, instructions), lines on paper, shadows, borders, digital artifacts, or complex backgrounds. Treat the main mathematical content as a single, coherent block (similar to Tesseract's Page Segmentation Mode 6).
2.  **Enhance Clarity:** Imagine converting the expression to a high-contrast, black-and-white representation. Focus on the shapes of the characters and symbols.
3.  **Character Recognition (Math Focus):** Identify characters strictly relevant to mathematics. Prioritize:
    *   Numbers: 0-9
    *   Variables: common letters like x, y, z, a, b, c, t, n, etc. (distinguish 'x' variable from '*' multiplication if context allows, prefer implicit multiplication).
    *   Operators: +, -, *, /, =, <, >, ≤, ≥, ±, √ (sqrt), ^ (exponent), fraction bars.
    *   Brackets/Parentheses: (), [], {}.
    *   Common Functions: sin, cos, tan, log, ln.
    *   Constants: π (pi), e.
4.  **Structure Preservation:** Maintain the original structure, including fractions, exponents (e.g., x^2), subscripts (e.g., y_1), and the order of operations.

Output Requirements:
*   Return ONLY the extracted mathematical expression text. Be precise.
    *   Example: Image shows "Q1: Solve 2x + 5 = 15". Output: "2x + 5 = 15"
    *   Example: Image shows handwritten "y = (1/2)x - 3" on lined paper. Output: "y = (1/2)x - 3"
    *   Example: Image shows "sqrt(a^2 + b^2)". Output: "sqrt(a^2 + b^2)"
*   If, after thorough analysis, NO recognizable mathematical expression can be identified (e.g., image is blank, completely blurry, contains only non-math content like a drawing or unrelated text), output the exact string "NO_TEXT_FOUND". Do not guess or hallucinate an expression if none is clearly present.
*   Do NOT add any explanations, formatting (like markdown code blocks), or introductory phrases. Just the raw expression or "NO_TEXT_FOUND".

Image: {{media url=imageDataUri}}

Extracted Mathematical Text:`,
});

const extractMathTextFlow = ai.defineFlow<
  typeof ExtractMathTextInputSchema,
  typeof ExtractMathTextOutputSchema
>({
  name: 'extractMathTextFlow',
  inputSchema: ExtractMathTextInputSchema,
  outputSchema: ExtractMathTextOutputSchema,
}, async input => {
 try {
    console.log("Calling Gemini Vision for math text extraction...");
    const { output } = await prompt(input);
    console.log("Raw Vision API Output:", output);


    // Ensure output is not null/undefined, fallback if necessary
    if (!output || output.extractedText === null || output.extractedText === undefined) {
        console.warn("OCR flow returned null/undefined output. Defaulting to NO_TEXT_FOUND.");
        return { extractedText: "NO_TEXT_FOUND" };
    }

    // Trim whitespace from the result
    const trimmedText = output.extractedText.trim();

    // Check if, after trimming, the string is empty or exactly the placeholder
    if (trimmedText === "") {
      console.warn("OCR flow returned an empty string after trimming. Interpreting as NO_TEXT_FOUND.");
      return { extractedText: "NO_TEXT_FOUND" };
    }

    // Return the trimmed result (could be "NO_TEXT_FOUND" or the actual expression)
    console.log("Returning extracted text:", trimmedText);
    return { extractedText: trimmedText };

  } catch (error) {
      console.error("Error executing extractMathTextFlow:", error);
       // Log the specific error
       const errorMsg = error instanceof Error ? error.message : "An unknown error occurred during OCR.";
       // Return a generic error indicator, distinct from NO_TEXT_FOUND
       // The UI component will handle displaying a user-friendly message based on this.
       // Avoid returning the raw error message to the schema.
       // Using "OCR_PROCESSING_ERROR" might be clearer than just "OCR Error."
      return { extractedText: "OCR_PROCESSING_ERROR" };
  }
});
