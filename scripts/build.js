/**
 * Build script for seanime-extensions repository
 * 
 * Generates index.json (marketplace index) from individual extension manifests.
 * Also populates manifestURI and payloadURI with correct GitHub raw URLs.
 * 
 * Usage: node scripts/build.js <github-username> <repo-name> [branch]
 * Example: node scripts/build.js yogap seanime-extensions main
 */

const fs = require("fs")
const path = require("path")

const args = process.argv.slice(2)
if (args.length < 2) {
    console.error("Usage: node scripts/build.js <github-username> <repo-name> [branch]")
    console.error("Example: node scripts/build.js yogap seanime-extensions main")
    process.exit(1)
}

const githubUser = args[0]
const repoName = args[1]
const branch = args[2] || "main"

const baseRawUrl = `https://raw.githubusercontent.com/${githubUser}/${repoName}/refs/heads/${branch}`
const extensionsDir = path.join(__dirname, "..", "extensions")
const outputFile = path.join(__dirname, "..", "index.json")

function buildIndex() {
    const extensions = []

    // Read all extension directories
    const dirs = fs.readdirSync(extensionsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)

    for (const dir of dirs) {
        const extDir = path.join(extensionsDir, dir)

        // Find the manifest JSON file (same name as directory)
        const manifestFile = path.join(extDir, `${dir}.json`)
        if (!fs.existsSync(manifestFile)) {
            console.warn(`⚠️  Skipping ${dir}: no ${dir}.json found`)
            continue
        }

        // Read the manifest
        const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"))

        // Find the source code file
        const tsFile = path.join(extDir, `${dir}.ts`)
        const jsFile = path.join(extDir, `${dir}.js`)
        let sourceFile = null
        let sourceFileName = null

        if (fs.existsSync(tsFile)) {
            sourceFile = tsFile
            sourceFileName = `${dir}.ts`
        } else if (fs.existsSync(jsFile)) {
            sourceFile = jsFile
            sourceFileName = `${dir}.js`
        }

        if (!sourceFile) {
            console.warn(`⚠️  Skipping ${dir}: no source file (.ts or .js) found`)
            continue
        }

        // Build the URLs
        const manifestURI = `${baseRawUrl}/extensions/${dir}/${dir}.json`
        const payloadURI = `${baseRawUrl}/extensions/${dir}/${sourceFileName}`

        // Read the source code
        const sourceCode = fs.readFileSync(sourceFile, "utf8")

        // Update the individual manifest file with correct URIs and inline payload
        manifest.manifestURI = manifestURI
        manifest.payload = sourceCode
        delete manifest.payloadURI
        fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n", "utf8")

        // Build the index entry (same as individual manifest)
        extensions.push({ ...manifest })
        console.log(`✅ ${manifest.name} (${manifest.id}) v${manifest.version} — ${manifest.type}`)
    }

    // Write index.json
    fs.writeFileSync(outputFile, JSON.stringify(extensions, null, 2) + "\n", "utf8")
    console.log(`\n📦 Generated index.json with ${extensions.length} extension(s)`)
    console.log(`🔗 Marketplace URL: ${baseRawUrl}/index.json`)
}

buildIndex()
