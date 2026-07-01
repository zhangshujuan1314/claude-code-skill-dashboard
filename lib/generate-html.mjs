// Embed data.json into template.html → skills.generated.html

import fs from 'node:fs';
import path from 'node:path';

/**
 * Generate self-contained HTML dashboard by embedding JSON data into the template.
 *
 * @param {string} dataJsonPath - path to data.json
 * @param {string} templatePath - path to template.html
 * @param {string} outputPath - path to write skills.generated.html
 */
export function generateHtml(dataJsonPath, templatePath, outputPath) {
  // Read data
  const dataRaw = fs.readFileSync(dataJsonPath, 'utf-8');
  const data = JSON.parse(dataRaw);

  // Read template
  let template = fs.readFileSync(templatePath, 'utf-8');

  // Embed data
  const jsonString = JSON.stringify(data);
  template = template.replace('{{DATA}}', jsonString);

  // Write output
  fs.writeFileSync(outputPath, template, 'utf-8');

  const sizeKB = (Buffer.byteLength(template, 'utf-8') / 1024).toFixed(1);
  console.log(`Generated: ${outputPath} (${sizeKB} KB)`);
  return { outputPath, sizeKB };
}
