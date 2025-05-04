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
      console.error("Invalid imageDataUri format provided to extractMathText:", input.imageDataUri?.substring(0, 50) + "...");
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
  prompt: `Analyze the provided image VERY carefully. Your primary goal is to identify and extract ONLY the main mathematical expression(s) present, whether printed or handwritten. Be precise and robust.

Image: {{media url=imageDataUri}}

Detailed Instructions:
1.  **Strict Focus on Math:** Extract *only* the mathematical symbols, numbers, variables (like x, y, a, b), standard function names (sin, cos, log, ln, sqrt), operators (+, -, *, /, ^), equals signs (=), parentheses/brackets (), and fraction bars.
2.  **Ignore Non-Math Elements:** Absolutely ignore surrounding text (like question numbers, instructions), background noise, paper lines, grids, shadows, fingers, page edges, or other non-mathematical visual elements. If the image contains multiple unrelated items, focus *only* on the math part.
3.  **Handwriting Challenges:** Be prepared for variations in handwriting. Interpret ambiguous characters in the context of a mathematical expression (e.g., a handwritten 'l' might be '1', 'O' might be '0', 'S' might be '5', 't' might be '+'). Make the most plausible interpretation.
4.  **Preserve Structure:** Maintain the original mathematical structure, including fractions (represent as 'numerator/denominator'), exponents (use '^'), subscripts (use '_'), parentheses, and the order of operations. Use standard ASCII math symbols. Use '*' for multiplication where explicitly written or clearly implied between numbers/variables if needed for clarity, but prefer implicit multiplication (e.g., '2x') where standard.
5.  **Output Format:**
    *   If a clear mathematical expression is successfully extracted, return *only* that expression as a single line of plain text. Do NOT add any explanation, commentary, greetings, or markdown formatting (like \`\`\`).
    *   If the image is blurry, unclear, contains no discernible mathematical content, or if you cannot reliably extract any math expression despite trying, return the exact string "NO_TEXT_FOUND". Do not guess wildly if unsure. Do not return empty strings.
    *   Do NOT output explanations like "The extracted text is..." or "I found...". Just the math expression or "NO_TEXT_FOUND".

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
    console.log("Calling Gemini Vision for math text extraction with enhanced prompt...");
    const { output } = await prompt(input);
    console.log("Raw Vision API Output:", output); // Log the raw output

    // Ensure output and extractedText are not null/undefined
    if (!output || output.extractedText === null || output.extractedText === undefined) {
        console.error("OCR flow received null or undefined output from the model. Returning OCR_PROCESSING_ERROR.");
        return { extractedText: "OCR_PROCESSING_ERROR" }; // Treat unexpected null/undefined as a processing error
    }

    // Trim whitespace from the result
    const trimmedText = output.extractedText.trim();
    console.log("Trimmed extracted text:", trimmedText);

    // Check if, after trimming, the string is empty or explicitly "NO_TEXT_FOUND"
    if (trimmedText === "" || trimmedText.toUpperCase() === "NO_TEXT_FOUND") {
      console.log("Model returned empty string or NO_TEXT_FOUND. Final result: NO_TEXT_FOUND");
      return { extractedText: "NO_TEXT_FOUND" };
    }

    // Further check: Sometimes the model might just return non-math descriptive text despite instructions.
    // This is a heuristic: If the text contains very few math-related characters, consider it as NO_TEXT_FOUND.
    const mathChars = /[0-9xXyYaAbBcCnN+\-*/^=()\[\]{}<>_.,|√∑∫∂∞≈≠≤≥∈∉∀∃∴∵]/;
    const nonMathCharsThreshold = 0.7; // If > 70% chars are NOT common letters/numbers/math symbols
    let nonMathCount = 0;
    for (const char of trimmedText) {
        if (!mathChars.test(char) && !/[a-zA-Z]/.test(char)) { // Allow letters for variables/functions
             nonMathCount++;
        }
    }
     if (trimmedText.length > 0 && (nonMathCount / trimmedText.length) > nonMathCharsThreshold) {
        console.warn(`Extracted text "${trimmedText}" seems non-mathematical based on character analysis. Treating as NO_TEXT_FOUND.`);
        return { extractedText: "NO_TEXT_FOUND" };
     }


    // Return the trimmed result
    console.log("Returning potentially valid extracted text:", trimmedText);
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
