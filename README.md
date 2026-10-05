# Swipe & Eat

Static PWA. No build step, no dependencies.

## Deploy on GitHub Pages
1. Create a repo and upload everything in this folder to the repo root (keep the folder structure).
2. Settings > Pages > Deploy from a branch > `main` / `(root)`.
3. Open `https://<you>.github.io/<repo>/` in Safari on your iPhone.
4. Share > Add to Home Screen.

## Your restaurants
1. Google Takeout > "Saved" > export. Each list is a CSV: Title, Note, URL, Tags, Comment.
2. In Sheets/Excel add optional columns: `Type`, `Area`, `Occasion`, `Price`, `Photo`.
   Separate multiple values with `;` (e.g. `Casual; Quick bite`).
3. Save as CSV and replace `data/restaurants.csv` (or use Menu > Import CSV, which is stored on that phone only).

## Photos
1. Put your own photos in the `photos/` folder (JPEG, about 600-800px wide, under ~150 KB each).
2. In the `Photo` column write the path, e.g. `photos/tim-ho-wan.jpg`. (A full https:// image link also works.)
3. No photo, or a wrong filename? The card falls back to the emoji.
4. Filenames are case-sensitive on GitHub Pages: `Ramen.JPG` is not `ramen.jpg`.
