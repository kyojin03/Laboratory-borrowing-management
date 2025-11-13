Laboratory Borrowing Management System 2025
Files included:
- Laboratory_Borrowing_Management_System_2025.xlsx  (template to upload to Google Sheets)
- Code.gs  (Apps Script - paste into Extensions > Apps Script)
- index.html  (frontend for GitHub Pages; put GS.png beside it in repo)
- GS.png  (logo image)

Quick setup:
1. Upload the .xlsx to Google Drive and open with Google Sheets.
2. In the Sheet, go to Extensions -> Apps Script. Create a new project and paste Code.gs.
3. Deploy the Apps Script as a Web App (Execute as: Me; Who has access: Anyone, even anonymous). Authorize and copy the Web App URL.
4. In index.html, replace YOUR_SCRIPT_URL_HERE with the Web App URL.
5. Create a GitHub repo, add index.html and GS.png at repo root, push.
6. Enable GitHub Pages for the repo (branch main, root). Your site will be live at https://<username>.github.io/<repo>/
7. Test the site: submit forms and check the Google Sheet. Dashboard pulls live stats from Apps Script.

Notes:
- The Dashboard formulas use Google Sheets functions (UNIQUE, FILTER) and will work after uploading to Google Sheets.
- Sheet names must be 'Equipment' and 'Chemicals' (case-sensitive) for the script to work.
- No personal name/credit included per your request.
