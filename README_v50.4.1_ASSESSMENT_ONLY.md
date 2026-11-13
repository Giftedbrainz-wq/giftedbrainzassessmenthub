# Assessment Hub v50.4.1 — corrected division of branding

**Assessment Hub and EduSpace are different applications.** This version follows EduSpace's layout, colours and typography, but **does not import EduSpace's profile avatars, team badges or subject-cover imagery.** The shared Gifted Brainz company logo remains on the Hub to identify the platform. EduSpace keeps its own images and Battle Arena assets.

## Install
1. Extract the v50.4.1 ZIP into a new empty folder. There is **one clearly named top-level folder**. Open it to find `index.html`, `app.js`, `styles.css`, `eduspace-ui.css` and `assets/`.
2. Back up the current Assessment Hub website and its environment configuration. Upload/deploy the application to the **Assessment Hub EdgeOne project only**. Do not upload these files to EduSpace.
3. Retain your existing DB and EdgeOne credentials. No additional SQL is required for this graphical correction.
4. Refresh the site ignoring cache (`Ctrl+Shift+R`) after deployment.
5. Check admin dashboard, quiz editor, CBT intro/questions/results, mobile layout and Brainz Biltz on a staging domain. Verify no subject image and no team/student avatar appear in the Assessment Hub.

## Checks
`npm run check && npm test` in Node 20+. The automated checks do not replace full staging tests with live EdgeOne storage and data.
