import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const root = fileURLToPath(new URL('..', import.meta.url));
const dataDir = join(root, 'public/data');
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
for (const f of readdirSync(join(root, 'schemas'))) {
  ajv.addSchema(JSON.parse(readFileSync(join(root, 'schemas', f), 'utf8')));
}

let errors = 0;
const readJson = (p: string): unknown => JSON.parse(readFileSync(p, 'utf8'));
function check(schemaId: string, path: string): unknown {
  const data = readJson(path);
  const validate = ajv.getSchema(schemaId)!;
  if (!validate(data)) {
    errors++;
    console.error(`✗ ${path}\n${ajv.errorsText(validate.errors, { separator: '\n  ' })}`);
  }
  return data;
}

const manifest = check('manifest.schema.json', join(dataDir, 'manifest.json')) as {
  trial: string;
  cases: string[];
};
if (!manifest.cases.includes(manifest.trial)) {
  errors++;
  console.error(`✗ manifest: trial case ${manifest.trial} is not in cases`);
}
// Anything fetched before submit must not hint at the label: no TCGA project codes,
// sample types or barcodes in case files, slide IDs or tile URLs.
const LEAK =
  /TCGA|LUAD|LUSC|solid tissue|primary tumou?r|normal|adeno|squam|carcinoma|-[01]\d[A-Z]\b/i;
const templates = new Set<string>();
for (const f of readdirSync(join(dataDir, 'templates'))) {
  const t = check('template.schema.json', join(dataDir, 'templates', f)) as { id: string };
  templates.add(t.id);
}
for (const id of manifest.cases) {
  const casePath = join(dataDir, 'cases', `${id}.json`);
  const c = check('case.schema.json', casePath) as {
    id: string;
    split: string;
    templateId: string;
    tiles: { dzi: string };
  };
  if ((c.split === 'trial') !== (id === manifest.trial)) {
    errors++;
    console.error(`✗ case ${id}: split "trial" must match manifest.trial`);
  }
  const leak = readFileSync(casePath, 'utf8').match(LEAK);
  if (leak) {
    errors++;
    console.error(`✗ case ${id}: label hint "${leak[0]}" in a pre-submit file (ADR-004)`);
  }
  // Tiles are cached as immutable, so re-tiled slides must move to a new /v<n>/ directory.
  if (!new RegExp(`/v\\d+/${id}\\.dzi$`).test(c.tiles.dzi)) {
    errors++;
    console.error(`✗ case ${id}: DZI must be <tiles>/v<n>/${id}.dzi (opaque name, versioned path)`);
  }
  if (c.id !== id) {
    errors++;
    console.error(`✗ case ${id}: id mismatch (${c.id})`);
  }
  if (!templates.has(c.templateId)) {
    errors++;
    console.error(`✗ case ${id}: unknown template ${c.templateId}`);
  }
  const answer = join(dataDir, 'answers', `${id}.json`);
  if (!existsSync(answer)) {
    errors++;
    console.error(`✗ case ${id}: missing answers/${id}.json`);
  } else {
    const a = check('answer.schema.json', answer) as { id: string };
    if (a.id !== id) {
      errors++;
      console.error(`✗ answers/${id}.json: id mismatch (${a.id})`);
    }
  }
}
const caseFiles = readdirSync(join(dataDir, 'cases')).map((f) => f.replace(/\.json$/, ''));
for (const id of caseFiles) {
  if (!manifest.cases.includes(id)) {
    errors++;
    console.error(`✗ cases/${id}.json is not listed in manifest.json`);
  }
}

if (errors) {
  console.error(`\n${errors} validation error(s)`);
  process.exit(1);
}
console.log(`✓ data valid: ${manifest.cases.length} case(s), ${templates.size} template(s)`);
