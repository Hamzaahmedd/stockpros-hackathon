import fs from "node:fs";
import path from "node:path";
import _ from "lodash";

// Determine the project root's path relative to the script's location
// (Assuming the script is one level down, e.g., 'scripts/snake_case_mapper.js')
const projectRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(projectRoot, "prisma", "schema.prisma");

try {
  if (!fs.existsSync(schemaPath)) {
    console.error(`Error: Could not find schema.prisma at expected location: ${schemaPath}`);
    console.error("Please ensure the script is located one directory level above the 'prisma' folder (e.g., inside 'scripts/').");
    process.exit(1);
  }

  const original = fs.readFileSync(schemaPath, "utf-8");
  const lines = original.split("\n");
  let insideModel = false;
  let processed: string[] = [];
  let currentModelName: string | null = null;

  for (let line of lines) {
    const trimmed = line.trim();

    // 1. Model Start Detection
    if (trimmed.startsWith("model ")) {
      insideModel = true;
      currentModelName = trimmed.split(/\s+/)[1];
      processed.push(line);
      continue;
    }

    // 2. Model End Detection
    if (insideModel && trimmed === "}") {
      insideModel = false;
      currentModelName = null;
      processed.push(line);
      continue;
    }

    // 3. Process Field Lines within a model
    if (
      insideModel &&
      trimmed &&
      !trimmed.startsWith("@") &&
      !trimmed.startsWith("//")
    ) {
      // Skip lines that already have a @map attribute
      if (trimmed.includes("@map(")) {
        processed.push(line);
        continue;
      }

      // Split the line into parts: [0] fieldName, [1] fieldType, [2...] attributes
      const parts = trimmed.split(/\s+/).filter((p: string) => p.length > 0);

      if (parts.length < 2) {
          processed.push(line);
          continue; // Skip malformed lines
      }

      const fieldName = parts[0];
      const fieldType = parts[1];
      // Everything after the field type (attributes and comments)
      const rest = parts.slice(2).join(" ");

      // Skip relation fields
      const isScalarType = ["String", "Boolean", "Int", "Float", "DateTime", "Json", "BigInt", "Bytes", "Decimal"].includes(fieldType.replace(/[!?\[\]]/g, ''));
      const isRelationField = /^[A-Z]/.test(fieldType) && !isScalarType;

      if (!isRelationField) {
        const mapped = _.snakeCase(fieldName);

        // Only add mapping if the name actually needs conversion
        if (fieldName && fieldName !== mapped) {
          // Construct the new line: Field Type Attributes @map("snake_case")
          const newLine = `${fieldName} ${fieldType} ${rest} @map("${mapped}")`.trim();

          processed.push(newLine);
          continue;
        }
      }
    }

    // Push the line as is (directives, comments, blank lines, or lines that were skipped)
    processed.push(line);
  }

  // --- File Writing (Direct Overwrite) ---
  fs.writeFileSync(schemaPath, processed.join("\n"), "utf-8");

  console.log("SUCCESS: schema.prisma updated with snake_case field mappings.");

} catch (e: any) {
  console.error("\n❌ An error occurred during schema processing:", e.message);
  process.exit(1);
}
