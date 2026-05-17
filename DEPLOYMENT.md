# 🚀 Deploying "Neon Pop" to GitHub Pages

This guide outlines how to deploy your **Neon Pop (Balloon Pop)** SvelteKit game to GitHub Pages using modern static site rendering (SSR) and GitHub Actions.

---

## 🛠️ What We Configured

To support static hosting on GitHub Pages, we made the following improvements:
1. **Switched SvelteKit Adapter**: Replaced `@sveltejs/adapter-auto` with `@sveltejs/adapter-static` in `package.json` and `svelte.config.js`. This generates pure static HTML/JS/CSS files.
2. **Base Path Routing**: Configured the build base path in `svelte.config.js` to point to `/Balloon-pop` in production. This ensures all assets (stylesheets, scripts, images) load correctly under the subfolder URL on GitHub Pages.
3. **Safe Page-to-Page Navigation**: Updated `goto('/')` and `goto('/game')` in Svelte pages to use SvelteKit's dynamic `{base}` path, preventing 404 errors during client-side page routing.
4. **Static Prerendering**: Created a root `src/routes/+layout.ts` instructing SvelteKit to prerender the application.
5. **GitHub Actions Workflow**: Added `.github/workflows/deploy.yml` which automates building and deploying the project on every push to your `master` branch.

---

## 📋 Step-by-Step Deployment Instructions

Follow these three simple steps to publish your game live:

### 1. Commit and Push Changes to GitHub
Open your terminal (PowerShell, CMD, or Git Bash) inside the project directory and run:

```bash
# Stage all changes (new files, config edits, and code updates)
git add .

# Commit changes with a descriptive message
git commit -m "Configure SvelteKit static adapter and CI/CD for GitHub Pages deployment"

# Push to your remote repository on GitHub
git push origin master
```

---

### 2. Configure GitHub Pages to use GitHub Actions
For security and efficiency, your repository must be configured to allow GitHub Actions to publish your site:

1. Open your web browser and go to your repository:  
   👉 [https://github.com/Talha5252/Balloon-pop](https://github.com/Talha5252/Balloon-pop)
2. Click on the ⚙️ **Settings** tab at the top of the repository page.
3. On the left sidebar, scroll down to the **Code and automation** section and click on 📄 **Pages**.
4. In the **Build and deployment** section, look for **Source**.
5. Change the dropdown menu from **Deploy from a branch** to **GitHub Actions**.

> [!IMPORTANT]
> Selecting **GitHub Actions** is mandatory. If this is not set, GitHub will ignore the `.github/workflows/deploy.yml` configuration and the deployment will fail.

---

### 3. Track and Verify Your Deployment
Once the push is complete and the setting is saved:

1. Click on the 🎬 **Actions** tab of your repository.
2. You will see a workflow run named **Deploy to GitHub Pages** starting or running.
3. Click on the run to view the build log. SvelteKit will build in under a minute, package the files, and publish them.
4. Once the deployment job finishes, it will display a live link:
   👉 **`https://talha5252.github.io/Balloon-pop/`**

---

## 💡 Troubleshooting & Local Testing

### Local Production Preview
To test exactly how SvelteKit compiles and pre-renders the app before pushing, you can build and run a local preview:

```bash
# Build the project locally
pnpm build

# Preview the built static assets locally
pnpm preview
```

### Route Refreshing (404 Fallback)
If users reload their browsers on subpages like `/game`, GitHub Pages will look for a static file named `game.html` (which doesn't exist). 
To solve this, we configured `adapter-static` to generate a `404.html` fallback. GitHub Pages will serve this file, allowing SvelteKit's single-page app router to take over and render the correct `/game` view instantly without throwing a browser 404 error!
