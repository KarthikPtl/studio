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
    .describe('The mathematical text extracted from the image, focusing only on the expression itself, or "NO_TEXT_FOUND" if no clear mathematical expression could be reliably identified, or "OCR_PROCESSING_ERROR" if the extraction process failed.'),
});
export type ExtractMathTextOutput = z.infer<typeof ExtractMathTextOutputSchema>;

export async function extractMathText(input: ExtractMathTextInput): Promise<ExtractMathTextOutput> {
  // Basic check for valid data URI format - this is a weak check
  if (!input.imageDataUri || !input.imageDataUri.startsWith('data:image/')) {
      console.error("Invalid imageDataUri format provided to extractMathText.");
      return { extractedText: "OCR_PROCESSING_ERROR" };
  }
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
        .describe('The mathematical text extracted from the image, focusing only on the expression itself. If NO clear mathematical expression is found, respond with the exact string "NO_TEXT_FOUND".'),
    }),
  },
  model: 'googleai/gemini-pro-vision', // Use Vision model
  prompt: `Analyze the provided image. Your task is to identify and extract ONLY the primary mathematical expression present, whether printed or handwritten.

Instructions:
1.  **Focus:** Extract only the mathematical characters, symbols, numbers, and standard function names (like sin, cos, log). Ignore surrounding text, background elements, paper lines, etc.
2.  **Accuracy:** Preserve the original structure (fractions, exponents, parentheses).
3.  **Output:**
    *   If a clear mathematical expression is found, return *only* that expression as plain text.
    *   If NO clear mathematical expression can be reliably identified in the image (e.g., image is blank, blurry, contains only non-math content), return the exact string "NO_TEXT_FOUND".
    *   Do NOT add any explanations, greetings, or markdown formatting.

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

    // Ensure output and extractedText are not null/undefined
    if (!output || output.extractedText === null || output.extractedText === undefined) {
        console.warn("OCR flow received null or undefined output from the model. Interpreting as NO_TEXT_FOUND.");
        return { extractedText: "NO_TEXT_FOUND" }; // Or potentially OCR_PROCESSING_ERROR if this is unexpected
    }

    // Trim whitespace from the result
    const trimmedText = output.extractedText.trim();

    // Check if, after trimming, the string is empty
    if (trimmedText === "") {
      console.warn("OCR flow returned an empty string after trimming. Interpreting as NO_TEXT_FOUND.");
      return { extractedText: "NO_TEXT_FOUND" };
    }

    // Handle cases where the model might explicitly return known non-math strings (though prompt asks for NO_TEXT_FOUND)
    if (trimmedText.toUpperCase() === "NO_TEXT_FOUND") {
        console.log("Model explicitly returned NO_TEXT_FOUND.");
        return { extractedText: "NO_TEXT_FOUND" };
    }

    // Return the trimmed result (could be the actual expression or potentially still "NO_TEXT_FOUND")
    console.log("Returning extracted text:", trimmedText);
    return { extractedText: trimmedText };

  } catch (error) {
      console.error("Error executing extractMathTextFlow:", error);
       // Log the specific error for debugging
       const errorMsg = error instanceof Error ? error.message : "An unknown error occurred during OCR.";
       console.error("Underlying error:", errorMsg);

       // Return the specific error indicator for the UI
       return { extractedText: "OCR_PROCESSING_ERROR" };
  }
});
