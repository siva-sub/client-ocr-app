# Deployment Guide

This guide explains how to deploy the Client-Side OCR App to GitHub Pages and other platforms.

## GitHub Pages Deployment

### Method 1: Using GitHub Actions (Recommended)

1. **Create a new repository on GitHub**:
   ```bash
   # Initialize git
   git init
   git add .
   git commit -m "Initial commit"
   
   # Add remote and push
   git remote add origin https://github.com/siva-sub/client-ocr-app.git
   git branch -M main
   git push -u origin main
   ```

2. **Enable GitHub Pages**:
   - Go to your repository settings
   - Navigate to "Pages" section
   - Under "Build and deployment", select "GitHub Actions"

3. **The deployment will happen automatically** when you push to the main branch

### Method 2: Manual Deployment

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Deploy to GitHub Pages**:
   ```bash
   npm run deploy
   ```

## Other Deployment Options

### Netlify

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Deploy via Netlify CLI**:
   ```bash
   # Install Netlify CLI
   npm install -g netlify-cli
   
   # Deploy
   netlify deploy --dir=dist --prod
   ```

Or drag and drop the `dist` folder to [Netlify Drop](https://app.netlify.com/drop)

### Vercel

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel --prod
   ```

### Cloudflare Pages

1. **Connect your GitHub repository** to Cloudflare Pages
2. **Set build configuration**:
   - Build command: `npm run build`
   - Build output directory: `dist`

## Environment Configuration

### Custom Domain

To use a custom domain with GitHub Pages:

1. Create a `CNAME` file in the `public` directory with your domain
2. Configure your domain's DNS settings to point to GitHub Pages

### Base Path Configuration

If deploying to a subdirectory, update `vite.config.js`:

```javascript
export default defineConfig({
  base: '/your-subdirectory/',
  // ... other config
})
```

## Post-Deployment Checklist

- [ ] Test the live site on different devices
- [ ] Verify all features work correctly
- [ ] Check browser console for errors
- [ ] Test offline functionality (if PWA is enabled)
- [ ] Verify HTTPS is enabled
- [ ] Test loading performance

## Troubleshooting

### 404 Errors

If you get 404 errors after deployment:
- Ensure the `base` path in `vite.config.js` matches your deployment URL
- Check that all assets are being served from the correct path

### Model Loading Issues

If models fail to load:
- Check browser console for CORS errors
- Ensure the model URLs are accessible
- Verify network connectivity

### Build Failures

If the build fails:
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Check for TypeScript errors: `npm run build`
- Ensure all dependencies are correctly specified in `package.json`