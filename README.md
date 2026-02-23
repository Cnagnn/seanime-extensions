# Seanime Extensions Repository

Custom extensions for [Seanime](https://seanime.rahim.app/) — an open-source anime media server.

## 📦 Available Extensions

| Extension | Type | Language | Description |
|---|---|---|---|
| [Nimegami](extensions/nimegami/) | Online Streaming | Indonesian 🇮🇩 | Stream anime from nimegami.id with Sub Indo |

## 🔧 How to Use

### Add this repository to Seanime

1. Open **Seanime** → go to **Extensions** page
2. Click **Change repository**
3. Paste this URL:
   ```
   https://raw.githubusercontent.com/<YOUR_USERNAME>/seanime-extensions/refs/heads/main/index.json
   ```
4. Click **Save** → the extensions from this repo will appear in the Marketplace

### Install a single extension manually

1. Download the extension's `.json` manifest file from the `extensions/` folder
2. Place it in Seanime's `extensions/` directory (inside your [data directory](https://seanime.rahim.app/docs/config#data-directory))
3. Restart Seanime

## 🛠️ For Developers — Adding a New Extension

### 1. Create your extension folder

```
extensions/
└── your-extension/
    ├── your-extension.ts    # Extension source code
    └── your-extension.json  # Manifest file
```

> **Important:** The folder name, `.ts` file name, and `.json` file name must all match.

### 2. Create the manifest file

```json
{
  "id": "your-extension",
  "name": "Your Extension Name",
  "description": "Short description of what it does",
  "manifestURI": "",
  "version": "1.0.0",
  "author": "Your Name",
  "type": "onlinestream-provider",
  "language": "typescript",
  "lang": "id",
  "payloadURI": ""
}
```

**Extension types:** `onlinestream-provider`, `anime-torrent-provider`, `manga-provider`, `custom-source`

### 3. Write the extension code

See [Seanime Extension Docs](https://seanime.gitbook.io/seanime-extensions) for guides on each type.

### 4. Build the index

```bash
node scripts/build.js <github-username> <repo-name> [branch]
```

This will:
- Auto-populate `manifestURI` and `payloadURI` in each manifest
- Generate `index.json` with all extensions

### 5. Commit & push

```bash
git add .
git commit -m "Add your-extension"
git push
```

## 📁 Repository Structure

```
seanime-extensions/
├── index.json              # Marketplace index (auto-generated)
├── extensions/
│   ├── nimegami/
│   │   ├── nimegami.ts     # Source code
│   │   └── nimegami.json   # Manifest
│   └── <new-extension>/
│       ├── <name>.ts
│       └── <name>.json
├── scripts/
│   └── build.js            # Build script
└── README.md
```

## 📝 License

MIT
