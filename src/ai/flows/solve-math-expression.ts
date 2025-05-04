
'use server';

/**
 * @fileOverview A Genkit flow to solve a mathematical expression, providing step-by-step solutions.
 *
 * - solveMathExpression - A function that takes a math expression string and returns the solution.
 * - SolveMathExpressionInput - The input type for the solveMathExpression function.
 * - SolveMathExpressionOutput - The return type for the solveMathExpression function.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';

const SolveMathExpressionInputSchema = z.object({
  expression: z
    .string()
    .describe('The corrected mathematical expression to be solved (e.g., "2x + 3 = 11", "x² - 4 = 0", "sin(π/2)"). Should not be "NO_TEXT_FOUND" or "OCR_PROCESSING_ERROR".'),
});
export type SolveMathExpressionInput = z.infer<typeof SolveMathExpressionInputSchema>;

const SolveMathExpressionOutputSchema = z.object({
  solution: z
    .string()
    .describe('A detailed, step-by-step solution to the mathematical expression, formatted in Markdown. Includes clear steps and the final answer(s), or a specific explanation if it cannot be solved. Uses easy-to-read notation like superscripts (x², y³) and the square root symbol (√), using parentheses √(...) for clarity when the radicand has multiple terms.'),
});
export type SolveMathExpressionOutput = z.infer<typeof SolveMathExpressionOutputSchema>;

export async function solveMathExpression(input: SolveMathExpressionInput): Promise<SolveMathExpressionOutput> {
  return solveMathExpressionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'solveMathExpressionPrompt',
  input: {
    schema: z.object({
      expression: z
        .string()
        .describe('The corrected mathematical expression to be solved (e.g., "2x + 3 = 11", "x² - 4 = 0", "sin(π/2)").'),
    }),
  },
  output: {
    schema: z.object({
      solution: z
        .string()
        .describe('A detailed, step-by-step solution to the mathematical expression, formatted in Markdown. Includes clear steps and the final answer(s), or a specific explanation if it cannot be solved. Uses easy-to-read notation like superscripts (x², y³) and the square root symbol (√), using parentheses √(...) for clarity when the radicand has multiple terms.'),
    }),
  },
  // Using a Pro model for potentially better mathematical reasoning
  model: 'googleai/gemini-1.5-pro',
  prompt: `You are a highly proficient and meticulous math tutor AI. Your task is to provide a detailed, step-by-step solution for the given mathematical expression or equation, formatted clearly using Markdown and prioritizing **readability and standard, user-friendly notation**.

Analyze the input expression: \`{{{expression}}}\`

Follow these instructions PRECISELY:

1.  **Identify Expression Type:** Determine if it's an arithmetic calculation, algebraic equation (linear, quadratic, etc.), system of equations, trigonometric evaluation, or other standard type.
2.  **Check Solvability & Solve:**
    *   If it's a calculation (e.g., "3 + 5 × 2"), perform it step-by-step respecting order of operations (PEMDAS/BODMAS).
    *   If it's a solvable equation (e.g., "2x + 3 = 11", "x² - 5x + 6 = 0"), find the value(s) of the variable(s). Show the main algebraic steps (isolating variable, factoring, using quadratic formula, simplifying radicals, etc.).
    *   If it's a simple system of linear equations, solve for all variables using methods like substitution or elimination, showing steps.
    *   If it involves standard functions (e.g., "sin(π/2)", "log10(100)", "√16"), evaluate them clearly.
3.  **Format Output as Markdown for Maximum Readability:**
    *   Use Markdown headings (e.g., \`## Steps\`) or numbered lists (\`1. ...\`, \`2. ...\`) for clarity.
    *   **Use Simple Language:** Explain steps clearly, as if tutoring someone. Avoid overly technical jargon where possible.
    *   **Use Preferred Math Notation:**
        *   **Exponents:** Strongly prefer superscript characters (e.g., \`x²\`, \`y³\`, \`2³\`) for simple, single-digit/variable exponents. If superscripts are not feasible (e.g., for complex exponents like \`(2x+1)\` or fractional exponents), use the caret (\`^\`) with parentheses around the base and/or exponent as needed for clarity, like \`(x+y)²\` or \`e^(2x+1)\` or \`x^(1/2)\`. Avoid using superscripts for multi-character exponents if it looks confusing.
        *   **Square Roots:** ALWAYS use the actual square root symbol \`√\`. For single numbers or variables (like \`√16\`, \`√x\`), the symbol alone is sufficient. For expressions with multiple terms under the root, **MUST** use parentheses to clearly show the scope: \`√(expression)\` (e.g., \`√(x² + 1)\`, \`√(9 - y²)\`). NEVER use \`sqrt()\`.
        *   **Multiplication:** Use the multiplication sign \`×\` (times symbol) or implicit multiplication (e.g., \`2x\`) where appropriate. Avoid using \`*\` unless necessary for clarity between numbers (e.g., \`3 × 4\`).
        *   **Division:** Use the division sign \`÷\` or fraction notation (\`numerator/denominator\`) where appropriate. Parenthesize complex numerators/denominators (e.g., \`(x+1)/(y-2)\`). Avoid using \`/\` alone for simple division if \`÷\` is clearer.
        *   Render math inline using backticks (\`...\`) for simple expressions or use standard text. For more complex steps or equations, consider placing them on their own line for clarity.
    *   Explain the *method* being used briefly and simply (e.g., \`1. Use the quadratic formula...\`, \`2. Subtract 3 from both sides...\`).
4.  **State Final Answer(s):** Clearly label the final result(s) using Markdown emphasis like \`**Final Answer:** ...\` or \`**Solution:** ...\`. For equations, state all valid solutions (e.g., \`x = 4\`, or \`x = 2, x = 3\`). Simplify answers fully (e.g., \`x = √2\`, not \`x = √8/2\`).
5.  **Handle Unsolvable/Invalid Cases (Format as Error/Conclusion):**
    *   If the expression is mathematically invalid (e.g., "2 + = 5", division by zero like "1/(2-2)"), state clearly: \`**Error:** The expression is mathematically invalid because [specific reason].\`
    *   If the input string itself does not appear to be a parsable mathematical expression, state: \`**Error:** The input does not look like a valid mathematical expression.\`
    *   If the equation has no real solution (e.g., "x² = -1"), explain why and state: \`**Conclusion:** The equation has no real solution.\` (Provide complex solutions like \`x = ±i\` if applicable and makes sense).
    *   If the equation has infinitely many solutions (e.g., "x + 1 = x + 1"), explain why and state: \`**Conclusion:** This equation is true for all valid values (infinite solutions).\`
    *   If it requires highly advanced math or is too ambiguous, state: \`**Error:** Solving this expression needs advanced math or more information.\`
    *   Provide a specific reason; do not use generic placeholders. Be definitive.

Input Expression:
\`{{{expression}}}\`

Markdown Solution:`,
});


const solveMathExpressionFlow = ai.defineFlow<
  typeof SolveMathExpressionInputSchema,
  typeof SolveMathExpressionOutputSchema
>({
  name: 'solveMathExpressionFlow',
  inputSchema: SolveMathExpressionInputSchema,
  outputSchema: SolveMathExpressionOutputSchema,
}, async input => {
  // Constants defined in the component importing this flow
  const NO_TEXT_FOUND_MESSAGE = "NO_TEXT_FOUND";
  const OCR_PROCESSING_ERROR_MESSAGE = "OCR_PROCESSING_ERROR";
  const MATH_AI_ERROR_PREFIX = "**Error:**";

  // Basic input validation - Check against known upstream failure states
  const trimmedExpression = input.expression?.trim();
  if (!trimmedExpression || trimmedExpression === NO_TEXT_FOUND_MESSAGE || trimmedExpression === OCR_PROCESSING_ERROR_MESSAGE) {
      // Return a specific error message if the input is clearly unusable from upstream OCR
      const reason = !trimmedExpression ? "empty" :
                     trimmedExpression === NO_TEXT_FOUND_MESSAGE ? "indicates no text was found" :
                     "it indicates an error occurred earlier";
      console.warn(`Solve flow received invalid input: ${reason}. Expression: "${input.expression}"`);
      return { solution: `${MATH_AI_ERROR_PREFIX} Cannot solve. The input expression ${reason}. Please provide a valid mathematical expression, possibly by correcting the OCR output.` };
  }

  try {
      console.log(`Calling solver model with expression: "${trimmedExpression}"`);
      const { output } = await prompt({ expression: trimmedExpression });

      // Ensure output is not null or undefined before returning
      if (!output || output.solution === null || output.solution === undefined) {
          // This indicates an unexpected failure in the AI generation itself
          console.error("AI failed to generate a solution for:", trimmedExpression);
          return { solution: `${MATH_AI_ERROR_PREFIX} The AI solver failed to generate a response. Please try again.` };
      }

      console.log("Solver returned (Markdown):", output.solution);
      // Basic check to ensure it looks somewhat like Markdown (weak check)
      if (!output.solution.includes('**') && !output.solution.includes('\n') && !/^\d+\./m.test(output.solution)) {
        console.warn("Solver output doesn't strongly resemble Markdown. Passing through anyway.");
      }
      return output;

  } catch (error) {
      console.error("Error occurred during solveMathExpressionFlow for:", trimmedExpression, error);
      // Handle potential errors thrown by the Genkit flow/prompt execution
      const errorMsg = error instanceof Error ? error.message : "An unknown error occurred during solving.";
      return { solution: `${MATH_AI_ERROR_PREFIX} An unexpected error occurred while trying to solve the expression: ${errorMsg}` };
  }
});

