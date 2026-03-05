/**
 * Parse a "Book of Food" text file into structured recipes.
 *
 * Format:
 * - Recipes separated by blank lines
 * - First line of each recipe is the name
 * - Remaining lines are ingredients/instructions
 * - A divider line "----------Stuff we've made but no recipe for now-------------"
 *   splits the file: above = full recipes, below = names with brief ingredient lists
 */

export interface ParsedRecipe {
  name: string
  ingredients: string
  instructions: string
  autoTags: string[] // tag names to match
}

// Auto-tagging rules: [pattern, tagName[], nameOnly?]
// All patterns use \b word boundaries to prevent substring false positives
// (e.g. "ragu" inside "asparagus", "wrap" as a cooking verb, "melt" as "melt butter")
const TAG_RULES: [RegExp, string[], boolean][] = [
  [/\b(?:pasta|spaghetti|fettuccine|bucatini|orecchiette|rigatoni|gnocchi|orzo|penne|linguine|cacio e pepe|carbonara|bolognese)\b/i, ['Pasta'], false],
  [/\bsalad\b/i, ['Salad'], false],
  [/\b(?:soup|stew|porridge|chowder)\b/i, ['Soup'], false],
  [/\b(?:sauce|pesto|dressing|vinaigrette)\b/i, ['Sauce'], true],
  [/\b(?:sandwich|BLT|burger|tuna melt|patty melt|grilled cheese)\b/i, ['Sandwich'], true],
  [/\b(?:wrap|wraps)\b/i, ['Sandwich'], true],
  [/\b(?:bread|baking|focaccia|biscuits?|scones?)\b/i, ['Baking'], true],
  [/\b(?:pie|pies)\b/i, ['Baking'], true],
  [/\b(?:cookies?|chocolate chip|chess pie|brownies?)\b/i, ['Sweets', 'Cookies'], false],
  [/\b(?:cake|cupcakes?|tart|crumble|crisp|cobbler)\b/i, ['Sweets'], true],
  [/\b(?:pancakes?|waffles?|crepes?)\b/i, ['Pancakes'], false],
  [/\b(?:omelette|frittata)\b/i, ['Breakfast'], false],
  [/\b(?:chicken|steak|lamb|pork|turkey|salmon|shrimp|meatballs?|sausage|beef|fish)\b/i, ['Protein'], true],
]

const DIVIDER_PATTERN = /^-{5,}.*-{5,}$/

export function parseRecipeFile(text: string): ParsedRecipe[] {
  const lines = text.split('\n')
  const recipes: ParsedRecipe[] = []

  let belowDivider = false
  let currentBlock: string[] = []

  const flushBlock = () => {
    if (currentBlock.length === 0) return

    const name = currentBlock[0].trim()
    if (!name) {
      currentBlock = []
      return
    }

    const bodyLines = currentBlock.slice(1)
    const bodyText = bodyLines.join('\n').trim()

    let ingredients = ''
    let instructions = ''

    if (belowDivider) {
      // Below divider: everything after name goes into ingredients
      ingredients = bodyText
    } else {
      // Above divider: try to split into ingredients and instructions
      // Heuristic: look for a natural break between ingredients and instructions
      // Instructions often start with lines like "Cook...", "Heat...", "Preheat...",
      // "Mix...", "Combine...", or after a blank line within the block
      const result = splitIngredientsInstructions(bodyLines)
      ingredients = result.ingredients
      instructions = result.instructions
    }

    const autoTags = detectTags(name, ingredients)

    recipes.push({ name, ingredients, instructions, autoTags })
    currentBlock = []
  }

  for (const line of lines) {
    if (DIVIDER_PATTERN.test(line.trim())) {
      flushBlock()
      belowDivider = true
      continue
    }

    if (line.trim() === '') {
      flushBlock()
    } else {
      currentBlock.push(line)
    }
  }

  flushBlock()

  return recipes
}

function splitIngredientsInstructions(lines: string[]): { ingredients: string; instructions: string } {
  // Look for a blank line break within the block or instruction-like patterns
  const instructionStarters = /^(cook|heat|preheat|bake|boil|sauté|saute|roast|grill|fry|mix|combine|stir|whisk|blend|toss|serve|drain|simmer|bring|add the|put the|place|season|set|let|allow|while|when|once|after|first|then|next|finally|meanwhile|instructions|directions|method|steps)/i

  let splitIdx = -1

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    // Check if this line looks like the start of instructions
    if (trimmed && instructionStarters.test(trimmed) && i > 0) {
      // Make sure we have at least one ingredient line before this
      const before = lines.slice(0, i).filter((l) => l.trim()).length
      if (before > 0) {
        splitIdx = i
        break
      }
    }
  }

  if (splitIdx >= 0) {
    return {
      ingredients: lines.slice(0, splitIdx).join('\n').trim(),
      instructions: lines.slice(splitIdx).join('\n').trim(),
    }
  }

  // No clear split found — put everything in ingredients
  return {
    ingredients: lines.join('\n').trim(),
    instructions: '',
  }
}

function detectTags(name: string, ingredients: string): string[] {
  const tags = new Set<string>()
  const fullText = `${name}\n${ingredients}`

  for (const [pattern, tagNames, nameOnly] of TAG_RULES) {
    const textToSearch = nameOnly ? name : fullText
    if (pattern.test(textToSearch)) {
      for (const t of tagNames) tags.add(t)
    }
  }

  return [...tags]
}
