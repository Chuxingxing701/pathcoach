import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const root = new URL('..', import.meta.url).pathname;
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
  cases: string[];
};
const templates = new Set<string>();
for (const f of readdirSync(join(dataDir, 'templates'))) {
  const t = check('template.schema.json', join(dataDir, 'templates', f)) as { id: string };
  templates.add(t.id);
}
for (const id of manifest.cases) {
  const c = check('case.schema.json', join(dataDir, 'cases', `${id}.json`)) as {
    id: string;
    templateId: string;
  };
  if (c.id !== id) {
    errors++;
    console.error(`✗ case ${id}: id mismatch (${c.id})`);
  }
  if (!templates.has(c.templateId)) {
    errors++;
    console.error(`✗ case ${id}: unknown template ${c.templateId}`);
  }
  const answer = join(dataDir, 'answers', `${id}.json`);
  if (existsSync(answer)) check('answer.schema.json', answer);
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
