
'use server';

/**
 * @fileOverview A Genkit flow to solve a mathematical expression or word problem, providing step-by-step solutions.
 *
 * - solveMathExpression - A function that takes a math expression/problem and optional context and returns the solution.
 * - SolveMathExpressionInput - The input type for the solveMathExpression function.
 * - SolveMathExpressionOutput - The return type for the solveMathExpression function.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';

const SolveMathExpressionInputSchema = z.object({
  expression: z
    .string()
    .nullable() // Expression might be null if only full text is relevant (e.g., pure word problem)
    .describe('The core mathematical expression to be solved, if extracted. Null if the main input is the full text context.'),
  fullTextContext: z
    .string()
    .describe('The full text context of the problem, which might be a word problem or contain the expression itself. This is the primary input if \'expression\' is null.'),
});
export type SolveMathExpressionInput = z.infer<typeof SolveMathExpressionInputSchema>;

const SolveMathExpressionOutputSchema = z.object({
  solution: z
    .string()
    .describe('A detailed, step-by-step solution formatted in Markdown. Solves the expression or the word problem described in the context. Includes clear steps, the final answer(s), or a specific explanation if it cannot be solved. Uses easy-to-read notation (superscripts, √).'),
});
export type SolveMathExpressionOutput = z.infer<typeof SolveMathExpressionOutputSchema>;

// Constants for error/status messages (ensure consistency with other flows)
const NO_TEXT_FOUND_MESSAGE = "NO_TEXT_FOUND";
const OCR_PROCESSING_ERROR_MESSAGE = "OCR_PROCESSING_ERROR";
const MATH_AI_ERROR_PREFIX = "**Error:**"; // Standard prefix for user-facing errors in the solution field

export async function solveMathExpression(input: SolveMathExpressionInput): Promise<SolveMathExpressionOutput> {
   // Input validation: Need at least fullTextContext
   if (!input.fullTextContext || [NO_TEXT_FOUND_MESSAGE, OCR_PROCESSING_ERROR_MESSAGE].includes(input.fullTextContext)) {
       const reason = !input.fullTextContext ? "is missing" : "indicates an upstream error";
       const errorMsg = `${MATH_AI_ERROR_PREFIX} Cannot solve because the required text context ${reason}. Please provide valid text, possibly by correcting the OCR output.`;
       console.warn(`Solve flow received invalid input context: "${input.fullTextContext}"`);
       return { solution: errorMsg };
   }
   // Expression is optional, but if provided, it shouldn't be an error message either
   if (input.expression && [NO_TEXT_FOUND_MESSAGE, OCR_PROCESSING_ERROR_MESSAGE].includes(input.expression)) {
        console.warn(`Solve flow received invalid expression input: "${input.expression}". Will rely on fullTextContext.`);
        // We can proceed using only fullTextContext, but nullify the bad expression
        input.expression = null;
   }


  return solveMathExpressionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'solveMathExpressionPrompt',
  input: {
    schema: z.object({
        expression: z.string().nullable().describe('The specific mathematical expression, if isolated.'),
        fullTextContext: z.string().describe('The full context, potentially a word problem containing the expression or question.'),
    }),
  },
  output: {
    schema: z.object({
      solution: z
        .string()
        .describe('A detailed, step-by-step solution formatted in Markdown. Solves the expression or word problem. Uses easy-to-read notation (superscripts, √).'),
    }),
  },
  model: 'googleai/gemini-1.5-pro', // Use Pro for better reasoning on word problems
  prompt: `You are a highly proficient and meticulous math tutor AI. Your task is to provide a detailed, step-by-step solution for the given mathematical problem, which might be a direct expression or a word problem. Format the solution clearly using Markdown and prioritize readability and standard, user-friendly notation.

Analyze the provided information:
- **Full Problem Context:** \`{{{fullTextContext}}}\`
- **Isolated Expression (if available):** \`{{{expression}}}\`

**Determine the Goal:**
- If an 'expression' is provided, focus on solving that expression, using the 'fullTextContext' for context if needed (e.g., variable definitions).
- If 'expression' is null or the 'fullTextContext' clearly represents a word problem, identify the question being asked in the word problem and solve it step-by-step.

Follow these instructions PRECISELY:

1.  **Identify Problem Type:** Is it a direct calculation, an algebraic equation, a word problem requiring setup, trigonometry, calculus, etc.?
2.  **Set Up (for Word Problems):** If it's a word problem, clearly state:
    *   What information is given.
    *   What needs to be found.
    *   Define any variables used.
    *   Write down the equation(s) needed to solve the problem based on the text.
3.  **Solve Step-by-Step:**
    *   Show the main steps involved in solving the equation or problem.
    *   Explain each step briefly and simply (e.g., "1. Add 3 to both sides:", "2. Calculate the area using A = πr²:").
    *   Respect the order of operations (PEMDAS/BODMAS).
4.  **Format Output as Markdown:**
    *   Use headings (\`##\`), numbered lists (\`1. ...\`), or bullet points (\`* ...\`) for clarity.
    *   Use simple, tutor-like language.
    *   **Preferred Math Notation:**
        *   **Exponents:** Use superscript characters (e.g., \`x²\`, \`y³\`, \`2³\`) for simple exponents. Use caret \`^\` ONLY for complex bases/exponents, with parentheses for clarity: \`(x+y)²\`, \`e^(2x+1)\`, \`x^(1/2)\`.
        *   **Square Roots:** ALWAYS use \`√\`. For multi-term radicands, MUST use parentheses: \`√(expression)\` (e.g., \`√(x² + 1)\`). For single terms: \`√16\`, \`√x\`.
        *   **Multiplication:** Use \`×\` or implicit multiplication (\`2x\`). Avoid \`*\`.
        *   **Division:** Use \`÷\` or fraction notation (\`numerator/denominator\`). Parenthesize complex numerators/denominators. Avoid \`/\`.
        *   Render math inline with backticks (\`...\`) or on separate lines for complex steps.
5.  **State Final Answer(s):** Clearly label the final result(s) using Markdown bold: \`**Final Answer:** ...\` or \`**Solution:** ...\`. Include units if applicable (from word problems). Simplify fully.
6.  **Handle Unsolvable/Invalid Cases (Format as Error/Conclusion):**
    *   If the input is mathematically invalid or nonsensical: \`**Error:** The problem is invalid because [specific reason].\`
    *   If the input doesn't seem to be a solvable math problem: \`**Error:** The input does not appear to be a valid mathematical problem.\`
    *   If there's no real solution: \`**Conclusion:** The equation/problem has no real solution because [reason].\` (Provide complex solutions if appropriate).
    *   If infinite solutions: \`**Conclusion:** This is true for all valid values (infinite solutions) because [reason].\`
    *   If requires advanced math beyond typical high school/early college level or is ambiguous: \`**Error:** Solving this requires advanced techniques or more information.\`
    *   Be specific and definitive.

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

  try {
      // Log the inputs being used (careful with PII in real scenarios)
      console.log(`Calling solver model with context: "${input.fullTextContext}" and expression: "${input.expression}"`);

      const { output } = await prompt(input); // Pass both context and expression

      // Ensure output is not null or undefined before returning
      if (!output || output.solution === null || output.solution === undefined) {
          console.error("AI failed to generate a solution for the provided input.");
          return { solution: `${MATH_AI_ERROR_PREFIX} The AI solver failed to generate a response. Please try again.` };
      }

      console.log("Solver returned (Markdown):", output.solution);
      // Optional: Basic check for Markdown structure or error prefix
      if (!output.solution.includes('**') && !output.solution.includes('\n') && !/^\d+\./m.test(output.solution) && !output.solution.startsWith(MATH_AI_ERROR_PREFIX)) {
        console.warn("Solver output doesn't strongly resemble expected Markdown or an Error message. Passing through anyway.");
      }
      return output;

  } catch (error) {
      console.error("Error occurred during solveMathExpressionFlow:", error);
      const errorMsg = error instanceof Error ? error.message : "An unknown error occurred during solving.";
      return { solution: `${MATH_AI_ERROR_PREFIX} An unexpected error occurred while trying to solve the problem: ${errorMsg}` };
  }
});
