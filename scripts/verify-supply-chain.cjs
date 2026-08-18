'use strict'

const fs = require('fs')
const path = require('path')

const root = process.cwd()

const manifestPaths = [
  path.join(root, 'package.json'),
]

for (const workspaceRoot of ['apps', 'packages']) {
  const directory =
    path.join(root, workspaceRoot)

  if (!fs.existsSync(directory)) {
    continue
  }

  for (
    const entry of
      fs.readdirSync(
        directory,
        { withFileTypes: true },
      )
  ) {
    if (!entry.isDirectory()) {
      continue
    }

    const manifest =
      path.join(
        directory,
        entry.name,
        'package.json',
      )

    if (fs.existsSync(manifest)) {
      manifestPaths.push(manifest)
    }
  }
}

const exactSemver =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

const allowedLocalProtocol =
  /^(?:workspace:|file:|link:)/

const violations = []

for (const manifestPath of manifestPaths) {
  const relative =
    path.relative(root, manifestPath)

  const manifest =
    JSON.parse(
      fs.readFileSync(
        manifestPath,
        'utf8',
      ),
    )

  for (
    const section of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
    ]
  ) {
    const dependencies =
      manifest[section]

    if (!dependencies) {
      continue
    }

    for (
      const [name, spec] of
        Object.entries(dependencies)
    ) {
      if (typeof spec !== 'string') {
        violations.push(
          `${relative}: ${section}.${name} has non-string spec`,
        )
        continue
      }

      if (allowedLocalProtocol.test(spec)) {
        continue
      }

      if (!exactSemver.test(spec)) {
        violations.push(
          `${relative}: ${section}.${name} must use an exact version; found "${spec}"`,
        )
      }
    }
  }
}

const workspacePath =
  path.join(root, 'pnpm-workspace.yaml')

const workspace =
  fs.readFileSync(
    workspacePath,
    'utf8',
  )

if (!/^savePrefix:\s*''\s*$/m.test(workspace)) {
  violations.push(
    'pnpm-workspace.yaml: savePrefix must be empty',
  )
}

if (!/^strictDepBuilds:\s*true\s*$/m.test(workspace)) {
  violations.push(
    'pnpm-workspace.yaml: strictDepBuilds must be true',
  )
}

if (/^onlyBuiltDependencies:\s*$/m.test(workspace)) {
  violations.push(
    'pnpm-workspace.yaml: dependency install scripts must not be allowed',
  )
}

if (
  /^dangerouslyAllowAllBuilds:\s*true\s*$/m.test(
    workspace,
  )
) {
  violations.push(
    'pnpm-workspace.yaml: dangerouslyAllowAllBuilds must never be enabled',
  )
}

function readStringList(text, key) {
  const lines =
    text.split(/\r?\n/)

  const index =
    lines.findIndex(
      (line) =>
        line.trim() === `${key}:`,
    )

  if (index < 0) {
    return null
  }

  const result = []

  for (
    let i = index + 1;
    i < lines.length;
    i++
  ) {
    const line = lines[i]

    if (line.trim() === '') {
      continue
    }

    if (!/^\s+/.test(line)) {
      break
    }

    const match =
      line.match(
        /^\s*-\s*(.+?)\s*$/,
      )

    if (!match) {
      continue
    }

    let value =
      match[1]

    if (
      (
        value.startsWith('"') &&
        value.endsWith('"')
      ) ||
      (
        value.startsWith("'") &&
        value.endsWith("'")
      )
    ) {
      value =
        value.slice(1, -1)
    }

    result.push(value)
  }

  return result
}

const expectedIgnoredBuilds = [
  '@prisma/engines',
  '@scarf/scarf',
  'argon2',
  'prisma',
  'unrs-resolver',
].sort()

const ignoredBuilds =
  readStringList(
    workspace,
    'ignoredBuiltDependencies',
  )

if (!ignoredBuilds) {
  violations.push(
    'pnpm-workspace.yaml: ignoredBuiltDependencies is missing',
  )
}
else {
  const actual =
    [...ignoredBuilds].sort()

  if (
    JSON.stringify(actual) !==
    JSON.stringify(expectedIgnoredBuilds)
  ) {
    violations.push(
      `pnpm-workspace.yaml: unexpected ignoredBuiltDependencies set: ${actual.join(', ')}`,
    )
  }
}

if (violations.length > 0) {
  console.error(
    'Supply-chain policy violations:',
  )

  for (const violation of violations) {
    console.error(`- ${violation}`)
  }

  process.exit(1)
}

console.log(
  `Supply-chain policy OK: ${manifestPaths.length} manifests; exact direct versions; 5 reviewed lifecycle scripts explicitly denied.`,
)
