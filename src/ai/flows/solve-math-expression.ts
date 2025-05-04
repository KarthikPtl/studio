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
    .describe('The corrected mathematical expression to be solved (e.g., "2x + 3 = 11", "x^2 - 4 = 0", "sin(pi/2)").'),
});
export type SolveMathExpressionInput = z.infer<typeof SolveMathExpressionInputSchema>;

const SolveMathExpressionOutputSchema = z.object({
  solution: z
    .string()
    .describe('A detailed, step-by-step solution to the mathematical expression, clearly indicating the final answer(s), or a specific explanation if it cannot be solved.'),
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
        .describe('The corrected mathematical expression to be solved (e.g., "2x + 3 = 11", "x^2 - 4 = 0", "sin(pi/2)").'),
    }),
  },
  output: {
    schema: z.object({
      solution: z
        .string()
        .describe('A detailed, step-by-step solution to the mathematical expression, clearly indicating the final answer(s), or a specific explanation if it cannot be solved.'),
    }),
  },
  // Use a more capable model for better mathematical reasoning
  model: 'googleai/gemini-1.5-pro',
  prompt: `You are a highly proficient and meticulous math solver AI. Your task is to provide a detailed, step-by-step solution for the given mathematical expression or equation.

Analyze the input expression: \`{{{expression}}}\`

Follow these instructions PRECISELY:

1.  **Identify Expression Type:** Determine if it's an arithmetic calculation, algebraic equation (linear, quadratic, etc.), system of equations (if applicable and simple), trigonometric evaluation, or other type.
2.  **Check Solvability:**
    *   If the expression is a calculation (e.g., "3 + 5 * 2"), perform the calculation step-by-step respecting order of operations (PEMDAS/BODMAS).
    *   If it's a solvable equation (e.g., "2x + 3 = 11", "x^2 - 5x + 6 = 0"), find the value(s) of the variable(s). Show the main algebraic steps (isolating variable, factoring, using quadratic formula, etc.).
    *   If it's a simple system of linear equations (e.g., "x + y = 5, x - y = 1"), solve for both variables using methods like substitution or elimination, showing steps.
    *   If it involves standard functions (e.g., "sin(pi/2)", "log10(100)"), evaluate them.
3.  **Show Steps Clearly:**
    *   Number each significant step or transformation.
    *   Use standard mathematical notation (e.g., use *, /, +, -, ^ for exponentiation). Use fractions where appropriate (e.g., 1/2 instead of 0.5 unless context demands decimal).
    *   Explain briefly what is being done in each step if it's not obvious (e.g., "Subtract 3 from both sides", "Apply quadratic formula").
4.  **State Final Answer(s):** Clearly label the final result(s) using "Final Answer:" or "Solution:". For equations, state all valid solutions (e.g., "x = 4", or "x = 2, x = 3").
5.  **Handle Unsolvable/Invalid Cases:**
    *   If the expression is mathematically invalid (e.g., "2 + = 5", division by zero like "1/0"), state: "Error: The expression is mathematically invalid because [specific reason]."
    *   If the expression contains non-mathematical text or is nonsensical (e.g., "solve blue+car"), state: "Error: The input does not appear to be a valid mathematical expression."
    *   If the equation has no solution (e.g., "x + 1 = x + 2"), demonstrate the contradiction and state: "Conclusion: The equation has no solution."
    *   If the equation has infinitely many solutions (e.g., "x + 1 = x + 1"), demonstrate the identity and state: "Conclusion: The equation is true for all values of x (infinite solutions)."
    *   If it requires advanced math beyond typical high school algebra/trigonometry that you cannot solve, state: "Error: Solving this expression requires advanced mathematical techniques beyond my current capabilities."
    *   DO NOT output placeholder messages like "Cannot determine equation type". Provide a specific reason based on the categories above.

Input Expression:
\`{{{expression}}}\`

Step-by-step Solution:`,
});


const solveMathExpressionFlow = ai.defineFlow<
  typeof SolveMathExpressionInputSchema,
  typeof SolveMathExpressionOutputSchema
>({
  name: 'solveMathExpressionFlow',
  inputSchema: SolveMathExpressionInputSchema,
  outputSchema: SolveMathExpressionOutputSchema,
}, async input => {
  // Basic input validation
  const trimmedExpression = input.expression?.trim();
  if (!trimmedExpression || trimmedExpression === "NO_TEXT_FOUND" || trimmedExpression === "OCR Error.") {
      // Return a specific error message if the input is clearly unusable
      return { solution: `Error: Invalid input received for solving. Expression was: "${trimmedExpression || 'empty'}". Please provide a valid mathematical expression.` };
  }

  // Optional: Add more sophisticated validation/sanitization here if needed
  // e.g., check for potentially harmful input, though the AI prompt also handles invalid math.

  try {
      const { output } = await prompt({ expression: trimmedExpression }); // Use the trimmed expression

      // Ensure output is not null or undefined before returning
      if (!output || !output.solution) {
          // This indicates an unexpected failure in the AI generation itself
          console.error("AI failed to generate a solution for:", trimmedExpression);
          return { solution: "Error: The AI solver failed to generate a response. Please try again." };
      }

      return output;

  } catch (error) {
      console.error("Error occurred during solveMathExpressionFlow for:", trimmedExpression, error);
      // Handle potential errors thrown by the Genkit flow/prompt execution
      const errorMsg = error instanceof Error ? error.message : "An unknown error occurred during solving.";
      return { solution: `Error: An unexpected error occurred while trying to solve the expression: ${errorMsg}` };
  }
});
